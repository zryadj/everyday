import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 在 GitHub Actions 中，GITHUB_REPOSITORY=owner/repo
// 自动将 base 设置为 '/repo/'，方便 GitHub Pages 正确寻址静态资源
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repo ? `/${repo}/` : '/'

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
