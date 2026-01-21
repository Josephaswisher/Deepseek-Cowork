/**
 * DeepSeek Cowork Blog - Client-side rendering logic
 * Static blog system using marked.js + highlight.js
 */

const Blog = {
    // Configuration
    config: {
        postsDir: './posts/',
        indexFile: './posts/index.json',
    },

    /**
     * Load and render post list
     */
    async loadPostList() {
        const container = document.getElementById('posts-container');
        const loadingState = document.getElementById('loading-state');
        const emptyState = document.getElementById('empty-state');
        const errorState = document.getElementById('error-state');

        try {
            const response = await fetch(this.config.indexFile);
            if (!response.ok) throw new Error('Failed to fetch posts index');
            
            const posts = await response.json();
            
            // Hide loading state
            if (loadingState) loadingState.remove();
            
            if (!posts || posts.length === 0) {
                // Show empty state
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            }

            // Sort by date (newest first)
            posts.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Render post cards
            const postsHTML = posts.map(post => this.renderPostCard(post)).join('');
            container.innerHTML = postsHTML;

        } catch (error) {
            console.error('Error loading posts:', error);
            if (loadingState) loadingState.remove();
            if (errorState) errorState.classList.remove('hidden');
        }
    },

    /**
     * Render single post card
     */
    renderPostCard(post) {
        const tagsHTML = post.tags && post.tags.length > 0 
            ? post.tags.map(tag => `<span class="tag px-2 py-1 rounded text-xs text-neutral-400">${this.escapeHtml(tag)}</span>`).join('')
            : '';

        const authorHTML = post.author ? `
            <a href="${post.author.url}" target="_blank" class="flex items-center gap-2 hover:opacity-80 transition-opacity" onclick="event.stopPropagation()">
                <img src="${post.author.avatar}" alt="${this.escapeHtml(post.author.name)}" class="w-5 h-5 rounded-full border border-white/10" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(post.author.name)}&background=333&color=fff&size=40'">
                <span class="text-xs text-neutral-400">@${this.escapeHtml(post.author.name)}</span>
            </a>
        ` : '';

        return `
            <a href="./post.html?slug=${encodeURIComponent(post.slug)}" class="block post-card glass-card rounded-2xl p-6 hover:border-white/20">
                <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div class="flex-1 min-w-0">
                        <h2 class="text-xl font-semibold text-white mb-2 group-hover:text-white/90">
                            ${this.escapeHtml(post.title)}
                        </h2>
                        <p class="text-neutral-400 text-sm leading-relaxed mb-3 line-clamp-2">
                            ${this.escapeHtml(post.summary || '')}
                        </p>
                        <div class="flex flex-wrap items-center gap-3">
                            ${authorHTML}
                            <span class="text-neutral-600">·</span>
                            <time class="text-xs text-neutral-500" datetime="${post.date}">
                                ${this.formatDate(post.date)}
                            </time>
                            ${tagsHTML ? `<div class="flex flex-wrap gap-2">${tagsHTML}</div>` : ''}
                        </div>
                    </div>
                    <div class="flex-shrink-0 text-neutral-500">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </div>
                </div>
            </a>
        `;
    },

    /**
     * Load and render single post
     */
    async loadPost(slug) {
        const headerEl = document.getElementById('post-header');
        const contentEl = document.getElementById('post-content');
        const loadingState = document.getElementById('loading-state');
        const errorState = document.getElementById('error-state');
        const footerEl = document.getElementById('post-footer');

        try {
            // 1. First fetch post metadata
            const indexResponse = await fetch(this.config.indexFile);
            if (!indexResponse.ok) throw new Error('Failed to fetch posts index');
            
            const posts = await indexResponse.json();
            const postMeta = posts.find(p => p.slug === slug);
            
            if (!postMeta) {
                throw new Error('Post not found');
            }

            // 2. Fetch Markdown content
            const mdResponse = await fetch(`${this.config.postsDir}${slug}.md`);
            if (!mdResponse.ok) throw new Error('Failed to fetch post content');
            
            let markdown = await mdResponse.text();
            
            // 3. Remove YAML frontmatter (if present)
            markdown = this.removeFrontmatter(markdown);

            // 4. Render post header
            this.renderPostHeader(headerEl, postMeta);

            // 5. Update page meta info
            this.updatePageMeta(postMeta);

            // 6. Render Markdown content
            const html = this.renderMarkdown(markdown);
            contentEl.innerHTML = html;

            // 7. Apply code highlighting
            this.highlightCode();

            // 8. Show footer navigation
            if (footerEl) footerEl.classList.remove('hidden');

        } catch (error) {
            console.error('Error loading post:', error);
            if (loadingState) loadingState.remove();
            if (headerEl) headerEl.innerHTML = '';
            if (contentEl) contentEl.innerHTML = '';
            if (errorState) errorState.classList.remove('hidden');
        }
    },

    /**
     * Render post header
     */
    renderPostHeader(container, post) {
        const tagsHTML = post.tags && post.tags.length > 0 
            ? post.tags.map(tag => `<span class="tag px-2 py-1 rounded text-xs text-neutral-400">${this.escapeHtml(tag)}</span>`).join('')
            : '';

        const authorHTML = post.author ? `
            <a href="${post.author.url}" target="_blank" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src="${post.author.avatar}" alt="${this.escapeHtml(post.author.name)}" class="w-10 h-10 rounded-full border border-white/20" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(post.author.name)}&background=333&color=fff&size=80'">
                <div class="flex flex-col">
                    <span class="text-white font-medium">@${this.escapeHtml(post.author.name)}</span>
                    <span class="text-xs text-neutral-500">on X</span>
                </div>
            </a>
        ` : '';

        container.innerHTML = `
            <h1 class="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
                ${this.escapeHtml(post.title)}
            </h1>
            <div class="flex flex-wrap items-center gap-6 text-sm text-neutral-400 pb-6 border-b border-white/10">
                ${authorHTML}
                <div class="flex items-center gap-4">
                    <time datetime="${post.date}">
                        <span class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                            ${this.formatDate(post.date)}
                        </span>
                    </time>
                    ${tagsHTML ? `<div class="flex flex-wrap gap-2">${tagsHTML}</div>` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Update page meta information
     */
    updatePageMeta(post) {
        // Update title
        document.title = `${post.title} - DeepSeek Cowork Blog`;
        
        // Update meta description
        const descEl = document.getElementById('meta-description');
        if (descEl && post.summary) {
            descEl.setAttribute('content', post.summary);
        }
        
        // Update Open Graph
        const ogTitleEl = document.getElementById('og-title');
        const ogDescEl = document.getElementById('og-description');
        if (ogTitleEl) ogTitleEl.setAttribute('content', post.title);
        if (ogDescEl && post.summary) ogDescEl.setAttribute('content', post.summary);
    },

    /**
     * Remove YAML frontmatter
     */
    removeFrontmatter(markdown) {
        const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
        return markdown.replace(frontmatterRegex, '');
    },

    /**
     * Render Markdown to HTML
     */
    renderMarkdown(markdown) {
        // Configure marked
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: true,
                mangle: false,
            });
            return marked.parse(markdown);
        }
        
        // If marked is not loaded, return preformatted text
        return `<pre>${this.escapeHtml(markdown)}</pre>`;
    },

    /**
     * Apply code highlighting
     */
    highlightCode() {
        if (typeof hljs !== 'undefined') {
            document.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
    },

    /**
     * Format date
     */
    formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return dateStr;
        }
    },

    /**
     * HTML escape to prevent XSS
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Calculate reading time (optional feature)
     */
    calculateReadingTime(text) {
        const wordsPerMinute = 200;
        const words = text.trim().split(/\s+/).length;
        const minutes = Math.ceil(words / wordsPerMinute);
        return minutes < 1 ? 1 : minutes;
    }
};

// Export to global
window.Blog = Blog;
