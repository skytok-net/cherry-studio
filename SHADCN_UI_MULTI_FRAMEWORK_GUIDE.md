# shadcn/ui Multi-Framework Support Guide

**Last Updated:** November 14, 2025  
**Status:** Production Ready

---

## 📚 Overview

shadcn/ui is a **copy-paste component system** (not an npm library) that provides beautifully designed, accessible UI components. Originally built for React, the shadcn philosophy has been ported to multiple frameworks.

**Key Insight:** shadcn/ui components are **copied into your project**, not installed as dependencies. This means:
- ✅ Full control over component code
- ✅ No dependency bloat
- ✅ Easy customization
- ✅ Framework-specific implementations available

---

## 🎯 Framework Implementations

### 1. **React** (Original)

**Repository:** [shadcn/ui](https://github.com/shadcn/ui)  
**Website:** [ui.shadcn.com](https://ui.shadcn.com)  
**Status:** ✅ Production Ready (98.7k GitHub stars)

**Tech Stack:**
- React 18+
- Radix UI (primitives)
- Tailwind CSS (styling)
- TypeScript

**Usage in Artifacts:**
```tsx
// Cherry Studio artifacts support these React components
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function App() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  )
}
```

**Available via:**
- Inline component code (recommended for artifacts)
- Copy-paste from ui.shadcn.com
- CLI: `npx shadcn-ui@latest add button`

---

### 2. **Svelte / SvelteKit**

**Repository:** [huntabyte/shadcn-svelte](https://github.com/huntabyte/shadcn-svelte)  
**Website:** [shadcn-svelte.com](https://www.shadcn-svelte.com)  
**Status:** ✅ Production Ready (4.8k+ GitHub stars)

**Tech Stack:**
- Svelte 4/5 + SvelteKit
- Bits UI (Svelte primitives, equivalent to Radix)
- Tailwind CSS
- TypeScript

**Usage in Svelte Artifacts:**
```svelte
<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { Card } from '$lib/components/ui/card'
</script>

<Card>
  <Button>Click me</Button>
</Card>
```

**Available via:**
- CLI: `npx shadcn-svelte@latest add button`
- Copy-paste from shadcn-svelte.com
- Inline component code

**Key Difference:**
- Uses `bits-ui` instead of Radix UI (Svelte-native primitives)
- Svelte 5 runes support for reactivity

---

### 3. **Solid.js / SolidStart**

**Repository:** [hngngn/shadcn-solid](https://github.com/hngngn/shadcn-solid)  
**Website:** [shadcn-solid.com](https://shadcn-solid.com)  
**Status:** ✅ Production Ready (700+ GitHub stars, active)

**Tech Stack:**
- Solid.js 1.8+
- Kobalte (Solid primitives, equivalent to Radix)
- Tailwind CSS
- TypeScript

**Usage in Solid Artifacts:**
```tsx
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function App() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  )
}
```

**Available via:**
- CLI: `npx shadcn-solid@latest add button`
- Copy-paste from shadcn-solid.com
- Inline component code

**Key Difference:**
- Uses `@kobalte/core` instead of Radix UI
- Solid's fine-grained reactivity (signals)
- Similar JSX syntax to React

---

### 4. **Vue / Nuxt**

**Repository:** [radix-vue/shadcn-vue](https://github.com/radix-vue/shadcn-vue)  
**Website:** [shadcn-vue.com](https://www.shadcn-vue.com)  
**Status:** ✅ Production Ready (6.5k+ GitHub stars)

**Tech Stack:**
- Vue 3 (Composition API)
- Radix Vue (Vue port of Radix UI)
- Tailwind CSS
- TypeScript

**Usage in Vue Artifacts:**
```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
</script>

<template>
  <Card>
    <Button>Click me</Button>
  </Card>
</template>
```

**Available via:**
- CLI: `npx shadcn-vue@latest add button`
- Copy-paste from shadcn-vue.com
- Inline component code

**Key Difference:**
- Uses `radix-vue` (Vue 3 port of Radix UI)
- Vue 3 Composition API with `<script setup>`
- 40+ components available

---

### 5. **Preact**

**Status:** 🔶 Community Support (no official port)

**Approach:**
- Use React shadcn/ui components with Preact's `preact/compat` layer
- Most shadcn components work out-of-the-box with `preact/compat`
- Radix UI has Preact compatibility

**Usage in Preact Artifacts:**
```jsx
// Use React syntax with preact/compat
import { h } from 'preact'
import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <Button>Click me</Button>
  )
}
```

**Available via:**
- Copy React shadcn components
- Configure `preact/compat` alias
- Inline component code (recommended for artifacts)

**Compatibility:** ~95% of React shadcn components work with Preact

---

## 📦 Component Availability Matrix

| Component | React | Svelte | Solid | Vue | Preact |
|-----------|-------|--------|-------|-----|--------|
| Button | ✅ | ✅ | ✅ | ✅ | ✅ |
| Card | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dialog | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dropdown | ✅ | ✅ | ✅ | ✅ | ✅ |
| Input | ✅ | ✅ | ✅ | ✅ | ✅ |
| Select | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tabs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Toast | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tooltip | ✅ | ✅ | ✅ | ✅ | ✅ |
| Form | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Table | ✅ | ✅ | ✅ | ✅ | ✅ |
| Avatar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Badge | ✅ | ✅ | ✅ | ✅ | ✅ |
| Checkbox | ✅ | ✅ | ✅ | ✅ | ✅ |
| Radio | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slider | ✅ | ✅ | ✅ | ✅ | ✅ |
| Switch | ✅ | ✅ | ✅ | ✅ | ✅ |
| Textarea | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendar | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Popover | ✅ | ✅ | ✅ | ✅ | ✅ |

**Legend:**
- ✅ Fully supported
- ⚠️ Partial support (may require adjustments)
- ❌ Not available

---

## 🎨 Cherry Studio Artifact Integration

### **Inline Component Strategy**

Since artifacts are sandboxed and don't have npm access, the recommended approach is to **inline shadcn component code** directly in the artifact.

### **Example: React Button Component**

```tsx
// Instead of: import { Button } from '@/components/ui/button'
// Inline the component:

import * as React from 'react'
import { cn } from 'clsx' // Available globally in artifacts

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'destructive' | 'outline' | 'ghost'
  }
>(({ className, variant = 'default', ...props }, ref) => {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
          'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
          'border border-input bg-background hover:bg-accent': variant === 'outline',
          'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
        },
        'h-10 px-4 py-2',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})

Button.displayName = 'Button'

export default function App() {
  return <Button>Click me</Button>
}
```

### **Why Inline?**

1. **No npm install** - Artifacts don't have package.json
2. **Full control** - Modify component as needed
3. **Self-contained** - Everything in one file
4. **Fast** - No external dependencies to load

---

## 🚀 Best Practices for Artifacts

### **1. Minimal Component Inlining**

Only inline the components you need:

```tsx
// ❌ Don't inline entire component library
// ✅ Inline only Button and Card

const Button = ({ children, ...props }) => {
  return <button className="..." {...props}>{children}</button>
}

const Card = ({ children, ...props }) => {
  return <div className="..." {...props}>{children}</div>
}

export default function App() {
  return (
    <Card>
      <Button>Hello</Button>
    </Card>
  )
}
```

### **2. Use Tailwind CSS Variables**

All artifacts have shadcn CSS variables available:

```tsx
<div className="bg-primary text-primary-foreground">
  Primary styled content
</div>

<div className="bg-secondary text-secondary-foreground">
  Secondary styled content
</div>
```

**Available CSS Variables:**
```css
--background
--foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--muted
--muted-foreground
--accent
--accent-foreground
--destructive
--destructive-foreground
--border
--input
--ring
--radius
```

### **3. Framework-Specific Syntax**

**React/Preact/Solid:**
```tsx
export default function App() {
  const [count, setCount] = useState(0)
  return <Button onClick={() => setCount(count + 1)}>Count: {count}</Button>
}
```

**Svelte:**
```svelte
<script lang="ts">
  let count = $state(0) // Svelte 5 runes
</script>

<Button on:click={() => count++}>Count: {count}</Button>
```

**Vue:**
```vue
<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <Button @click="count++">Count: {{ count }}</Button>
</template>
```

---

## 📋 Component Source URLs

### **Official CLI Installation:**

```bash
# React
npx shadcn-ui@latest add button

# Svelte
npx shadcn-svelte@latest add button

# Solid
npx shadcn-solid@latest add button

# Vue
npx shadcn-vue@latest add button
```

### **Copy-Paste Sources:**

- **React:** https://ui.shadcn.com/docs/components/button
- **Svelte:** https://www.shadcn-svelte.com/docs/components/button
- **Solid:** https://shadcn-solid.com/docs/components/button
- **Vue:** https://www.shadcn-vue.com/docs/components/button

### **GitHub Repositories:**

- **React:** https://github.com/shadcn/ui
- **Svelte:** https://github.com/huntabyte/shadcn-svelte
- **Solid:** https://github.com/hngngn/shadcn-solid
- **Vue:** https://github.com/radix-vue/shadcn-vue

---

## 🔧 Underlying Primitives

Each framework uses different UI primitive libraries:

| Framework | Primitive Library | Description |
|-----------|-------------------|-------------|
| React | [Radix UI](https://www.radix-ui.com/) | Unstyled, accessible React primitives |
| Svelte | [Bits UI](https://www.bits-ui.com/) | Svelte port of Radix UI |
| Solid | [Kobalte](https://kobalte.dev/) | Solid port of Radix UI |
| Vue | [Radix Vue](https://www.radix-vue.com/) | Vue 3 port of Radix UI |
| Preact | Radix UI (via compat) | Uses React Radix with compat layer |

**All primitives share:**
- WAI-ARIA compliance
- Keyboard navigation
- Focus management
- Screen reader support

---

## ✅ Cherry Studio Support Status

| Framework | Artifact Support | Auto-Retry | CDN Runtime | Transpilation |
|-----------|------------------|------------|-------------|---------------|
| React | ✅ Full | ✅ Yes | ✅ React 18 UMD | ✅ esbuild |
| Svelte | ✅ Ready | ✅ Yes | 🔜 Pending | ✅ esbuild |
| Solid | ✅ Ready | ✅ Yes | ✅ UMD available | ✅ esbuild |
| Vue | ✅ Ready | ✅ Yes | ✅ Vue 3 UMD | ✅ esbuild |
| Preact | ✅ Ready | ✅ Yes | ✅ Preact UMD | ✅ esbuild |

---

## 🎯 Recommendations for LLMs

When generating artifacts with shadcn/ui components:

1. **Inline minimal components** - Don't copy entire library
2. **Use Tailwind classes** - Leverage existing CSS variables
3. **Framework-specific syntax** - Match the artifact's framework
4. **Self-contained code** - Everything in one file
5. **Accessibility first** - Use semantic HTML and ARIA attributes
6. **TypeScript types** - Provide proper prop types

### **Example Prompt Response:**

> "I'll create a React artifact with a shadcn-style button. Since artifacts are sandboxed, I'll inline the button component:"

```tsx
import React from 'react'

const Button = ({ children, variant = 'default', ...props }) => {
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input hover:bg-accent',
  }
  
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium ${variants[variant]}`}
      {...props}
    >
      {children}
    </button>
  )
}

export default function App() {
  return <Button>Click me</Button>
}
```

---

## 📚 Additional Resources

- **shadcn/ui MCP Server:** [Jpisnice/shadcn-ui-mcp-server](https://github.com/Jpisnice/shadcn-ui-mcp-server)
  - Provides LLM context about component structure and usage
  - Supports React, Svelte 5, and Vue
  - Includes block implementations (dashboards, forms, calendars)

- **Community Templates:**
  - [shadcn-ui templates](https://shadcntemplates.com/)
  - [shadcn blocks](https://www.shadcnblocks.com/)

---

## 🏆 Summary

- ✅ **React:** Original, most mature (98k stars)
- ✅ **Svelte:** Excellent port with Bits UI (4.8k stars)
- ✅ **Solid:** High-quality port with Kobalte (700+ stars)
- ✅ **Vue:** Strong ecosystem with Radix Vue (6.5k stars)
- ✅ **Preact:** React compatibility via compat layer

**All frameworks supported in Cherry Studio artifacts with auto-retry and native transpilation!**

---

**Last Updated:** November 14, 2025  
**Maintained by:** Cherry Studio AI Artifacts Team

