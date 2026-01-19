---
title: 注入脚本编写指南
version: 1.0.0
created: 2026-01-11
updated: 2026-01-11
author: agent-kaichi
status: stable
---

# 注入脚本编写指南

本文档提供通过 `execute_script` API 编写注入脚本的规范和最佳实践。

---

## 概述

通过 Browser Control 的 `execute_script` API 执行 JavaScript 时，脚本会在浏览器页面环境中运行，结果通过 HTTP/WebSocket 返回。这个过程涉及：

1. **脚本传输**：JSON 格式通过 HTTP 发送
2. **脚本执行**：在页面上下文中执行
3. **结果序列化**：执行结果需要序列化后返回

每个环节都有需要注意的问题。**编写脚本前，务必阅读本指南**。

---

## 1. 基本原则

### 1.1 返回可序列化的值

脚本的返回值必须是可 JSON 序列化的类型。

```javascript
// 可序列化：string, number, boolean, null, array, plain object
document.title                    // string
document.querySelectorAll('a').length  // number
{ name: 'test', value: 123 }      // object

// 不可序列化：DOM 元素、函数、循环引用
document.querySelector('.btn')     // HTMLElement -> 返回 {}
() => {}                          // Function -> 无法序列化
```

### 1.2 使用 IIFE 封装复杂逻辑

对于多行脚本，使用立即执行函数表达式（IIFE）封装，避免变量泄露到全局作用域。

```javascript
// 推荐：IIFE 封装
(() => {
  const items = document.querySelectorAll('.item');
  return Array.from(items).map(el => el.textContent);
})()

// 避免：直接声明变量
const items = document.querySelectorAll('.item');  // 可能污染全局
Array.from(items).map(el => el.textContent);
```

### 1.3 防御性编程

假设任何 DOM 操作都可能失败，使用可选链和空值合并。

```javascript
// 安全：使用可选链
document.querySelector('.title')?.innerText

// 安全：提供默认值
document.querySelector('.title')?.innerText ?? '未找到标题'

// 危险：直接访问可能不存在的元素
document.querySelector('.title').innerText  // 元素不存在时报错
```

---

## 2. 编码处理

### 2.1 问题描述

当脚本包含中文或其他非 ASCII 字符时，可能出现编码问题：

- **传输层面**：HTTP 请求中的 JSON 字符串编码不一致
- **Shell 层面**：不同终端（PowerShell/Bash）对中文处理不同
- **平台差异**：Windows 和 Unix 系统的默认编码不同

### 2.2 何时需要处理

**规则**：脚本中包含以下内容时，必须进行编码处理：

- 中文字符（如：`搜索`、`提交`）
- 日文、韩文等非拉丁字符
- 特殊符号和 emoji

### 2.3 处理方案

#### 方案 A：Unicode 转义（推荐）

将中文字符转换为 `\uXXXX` 格式的 Unicode 转义序列。

```javascript
// 原始代码（包含中文）
document.querySelector('input').value = '搜索关键词'

// 转义后（安全）
document.querySelector('input').value = '\u641c\u7d22\u5173\u952e\u8bcd'
```

**转换方法**：

```javascript
// 在 Node.js 或浏览器控制台中运行
function toUnicodeEscape(str) {
  return str.split('').map(char => {
    const code = char.charCodeAt(0);
    if (code > 127) {
      return '\\u' + code.toString(16).padStart(4, '0');
    }
    return char;
  }).join('');
}

console.log(toUnicodeEscape('搜索关键词'));
// 输出: \u641c\u7d22\u5173\u952e\u8bcd
```

#### 方案 B：变量分离

将中文字符串作为参数传递，而不是硬编码在脚本中。

```javascript
// 构造时在外部处理编码
const keyword = '搜索关键词';
const encodedKeyword = JSON.stringify(keyword);  // 自动处理转义

const code = `document.querySelector('input').value = ${encodedKeyword}`;
```

### 2.4 平台注意事项

#### Windows PowerShell

PowerShell 对中文的处理较为复杂，建议：

1. 始终使用 Unicode 转义
2. 或将脚本写入文件后执行

```powershell
# 避免在 PowerShell 中直接使用中文
# 使用 Unicode 转义
curl -X POST http://localhost:3333/api/browser/execute_script `
  -H "Content-Type: application/json" `
  -d '{"tabId": 123, "code": "document.title = ''\u6d4b\u8bd5''"}'
```

#### Unix Shell (Bash/Zsh)

通常对 UTF-8 支持较好，但仍建议使用转义以确保一致性。

```bash
# 使用 Unicode 转义更安全
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123, "code": "document.title = '\''\u6d4b\u8bd5'\''"}'
```

---

## 3. 返回值处理

### 3.1 可序列化类型

| 类型 | 示例 | 说明 |
|------|------|------|
| string | `"hello"` | 直接返回 |
| number | `42`, `3.14` | 直接返回 |
| boolean | `true`, `false` | 直接返回 |
| null | `null` | 直接返回 |
| array | `[1, 2, 3]` | 元素必须可序列化 |
| object | `{a: 1}` | 属性值必须可序列化 |

### 3.2 不可序列化类型及解决方案

| 类型 | 问题 | 解决方案 |
|------|------|----------|
| DOM 元素 | 返回 `{}` | 提取需要的属性 |
| NodeList | 返回 `{}` | 使用 `Array.from()` 转换 |
| Function | 无法序列化 | 不要返回函数 |
| 循环引用 | 序列化报错 | 手动构建返回对象 |
| undefined | 可能丢失 | 使用 `null` 替代 |

```javascript
// 错误：返回 DOM 元素
document.querySelector('.user')

// 正确：提取需要的数据
(() => {
  const el = document.querySelector('.user');
  if (!el) return null;
  return {
    text: el.innerText,
    href: el.href,
    className: el.className
  };
})()
```

### 3.3 结构化返回值模式

推荐使用统一的返回值结构，便于调用方处理：

```javascript
(() => {
  try {
    // 业务逻辑
    const data = /* ... */;
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
})()
```

---

## 4. 错误处理

### 4.1 try-catch 包裹

对于复杂操作，始终使用 try-catch：

```javascript
(() => {
  try {
    const btn = document.querySelector('.submit-btn');
    if (!btn) throw new Error('Submit button not found');
    btn.click();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
})()
```

### 4.2 可选链和空值合并

善用 ES2020 特性简化空值检查：

```javascript
// 可选链 (?.) - 安全访问可能不存在的属性
document.querySelector('.title')?.innerText
document.querySelector('.link')?.href

// 空值合并 (??) - 提供默认值
document.querySelector('.count')?.innerText ?? '0'

// 组合使用
(() => ({
  title: document.querySelector('h1')?.innerText ?? 'No title',
  author: document.querySelector('.author')?.innerText ?? 'Unknown',
  date: document.querySelector('.date')?.innerText ?? null
}))()
```

### 4.3 统一错误返回格式

```javascript
// 推荐的错误返回格式
{
  success: false,
  error: "错误描述",
  code: "ERROR_CODE",      // 可选：错误代码
  details: { /* ... */ }   // 可选：详细信息
}
```

---

## 5. 异步操作

### 5.1 等待元素出现

页面可能有延迟加载的内容，需要等待元素出现：

```javascript
// 简单的元素等待函数
(() => {
  return new Promise((resolve) => {
    const check = () => {
      const el = document.querySelector('.lazy-content');
      if (el) {
        resolve({ success: true, content: el.innerText });
      } else {
        setTimeout(check, 100);
      }
    };
    check();
    // 超时处理
    setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
  });
})()
```

### 5.2 轮询检查模式

对于需要等待某个条件成立的场景：

```javascript
(() => {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 50;  // 最多检查 50 次
    const interval = 100;     // 每 100ms 检查一次

    const check = () => {
      attempts++;
      const loading = document.querySelector('.loading');
      
      if (!loading) {
        // 加载完成
        resolve({ success: true, data: document.body.innerText });
      } else if (attempts >= maxAttempts) {
        // 超时
        resolve({ success: false, error: 'Loading timeout' });
      } else {
        setTimeout(check, interval);
      }
    };
    
    check();
  });
})()
```

---

## 6. 常用模板

### 6.1 安全提取数据模板

```javascript
(() => {
  try {
    const items = document.querySelectorAll('.item');
    if (!items.length) {
      return { success: true, data: [], message: 'No items found' };
    }
    
    const data = Array.from(items).map(item => ({
      title: item.querySelector('.title')?.innerText?.trim() ?? '',
      link: item.querySelector('a')?.href ?? '',
      desc: item.querySelector('.desc')?.innerText?.trim() ?? ''
    }));
    
    return { success: true, data: data, count: data.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
})()
```

### 6.2 安全表单操作模板

```javascript
(() => {
  try {
    // 填写表单
    const input = document.querySelector('input[name="search"]');
    if (!input) return { success: false, error: 'Input not found' };
    
    // 使用 Unicode 转义处理中文
    input.value = '\u641c\u7d22\u5173\u952e\u8bcd';  // "搜索关键词"
    
    // 触发 input 事件（某些框架需要）
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 点击提交
    const btn = document.querySelector('button[type="submit"]');
    if (!btn) return { success: false, error: 'Submit button not found' };
    
    btn.click();
    
    return { success: true, message: 'Form submitted' };
  } catch (e) {
    return { success: false, error: e.message };
  }
})()
```

### 6.3 滚动加载模板

```javascript
(() => {
  return new Promise((resolve) => {
    const scrollStep = async () => {
      const prevHeight = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      
      // 等待新内容加载
      await new Promise(r => setTimeout(r, 1000));
      
      const newHeight = document.body.scrollHeight;
      if (newHeight === prevHeight) {
        // 已到底部，收集数据
        const items = Array.from(document.querySelectorAll('.item'))
          .map(el => el.innerText);
        resolve({ success: true, data: items, count: items.length });
      } else {
        // 继续滚动
        scrollStep();
      }
    };
    
    scrollStep();
    
    // 超时保护
    setTimeout(() => {
      const items = Array.from(document.querySelectorAll('.item'))
        .map(el => el.innerText);
      resolve({ success: true, data: items, count: items.length, partial: true });
    }, 30000);
  });
})()
```

### 6.4 页面信息提取模板

```javascript
(() => ({
  url: location.href,
  title: document.title,
  meta: {
    description: document.querySelector('meta[name="description"]')?.content ?? null,
    keywords: document.querySelector('meta[name="keywords"]')?.content ?? null,
    ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null,
    ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null
  },
  stats: {
    links: document.querySelectorAll('a').length,
    images: document.querySelectorAll('img').length,
    forms: document.querySelectorAll('form').length
  }
}))()
```

---

## 7. 常见问题

### Q1: 脚本执行后返回空对象 `{}`

**原因**：返回了不可序列化的值（如 DOM 元素）

**解决**：提取需要的属性，返回普通对象

```javascript
// 错误：返回 DOM
document.querySelector('.item')

// 正确：返回数据
(() => {
  const el = document.querySelector('.item');
  return el ? { text: el.innerText, html: el.innerHTML } : null;
})()
```

### Q2: 中文显示为乱码

**原因**：编码问题

**解决**：使用 Unicode 转义

```javascript
// 错误：直接使用中文
'搜索'

// 正确：Unicode 转义
'\u641c\u7d22'
```

### Q3: 元素不存在导致脚本报错

**原因**：直接访问可能为 null 的元素属性

**解决**：使用可选链或先检查

```javascript
// 危险
document.querySelector('.btn').click()

// 安全
document.querySelector('.btn')?.click()
```

### Q4: 异步内容获取不到

**原因**：内容是动态加载的，执行时还未出现

**解决**：使用等待机制（参考第 5 节）

### Q5: 表单提交后数据没变化

**原因**：现代框架需要触发事件才能识别值变化

**解决**：设置值后触发 input 事件

```javascript
input.value = 'new value';
input.dispatchEvent(new Event('input', { bubbles: true }));
```

---

## 更新日志

### v1.0.0 (2026-01-11)
- 初始版本
- 基本原则、编码处理、返回值处理、错误处理
- 异步操作指南
- 4 个常用模板
- 5 个常见问题解答
