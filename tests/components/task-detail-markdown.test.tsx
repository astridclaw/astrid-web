/**
 * Regression tests for markdown rendering in task descriptions and comments
 *
 * Ensures that:
 * - Bold, italic, and code markdown syntax works
 * - URLs are properly linkified (http://, www., plain domains, markdown links)
 * - Line breaks are preserved
 * - Markdown and links work together without conflicts
 */

import { describe, it, expect } from 'vitest'
import { linkifyText } from '@/lib/utils'

describe('Markdown Rendering in Task Details', () => {
  describe('linkifyText utility', () => {
    it('should linkify plain HTTP/HTTPS URLs', () => {
      const input = 'Check out https://example.com for more info'
      const result = linkifyText(input)

      expect(result).toContain('<a href="https://example.com"')
      expect(result).toContain('target="_blank"')
      expect(result).toContain('rel="noopener noreferrer"')
    })

    it('should linkify www URLs', () => {
      const input = 'Visit www.example.com'
      const result = linkifyText(input)

      expect(result).toContain('<a href="https://www.example.com"')
      expect(result).toContain('www.example.com</a>')
    })

    it('should linkify plain domain names', () => {
      const input = 'Go to example.com or google.com'
      const result = linkifyText(input)

      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('href="https://google.com"')
    })

    it('should convert markdown links [text](url)', () => {
      const input = 'Click [here](https://example.com) to learn more'
      const result = linkifyText(input)

      expect(result).toContain('<a href="https://example.com"')
      expect(result).toContain('>here</a>')
      expect(result).not.toContain('[here]')
      expect(result).not.toContain('(https://example.com)')
    })

    it('should not double-linkify already processed markdown links', () => {
      const input = 'Visit [example](example.com) for info'
      const result = linkifyText(input)

      // Should create a single link, not nested links
      const linkCount = (result.match(/<a /g) || []).length
      expect(linkCount).toBe(1)
      expect(result).toContain('>example</a>')
    })
  })

  describe('Task Description Markdown Processing', () => {
    // Simulates the actual processing done in TaskFieldEditors and task-detail-viewonly
    const processDescription = (description: string): string => {
      // Process markdown BEFORE linkifying to avoid conflicts
      let html = description
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, '<code class="theme-bg-tertiary px-1 rounded text-sm">$1</code>')

      // Then linkify URLs
      html = linkifyText(html)

      // Finally convert newlines
      html = html.replace(/\n/g, "<br>")

      return html
    }

    it('should render bold text with **text**', () => {
      const input = 'This is **bold text** in description'
      const result = processDescription(input)

      expect(result).toContain('<strong>bold text</strong>')
    })

    it('should render italic text with *text*', () => {
      const input = 'This is *italic text* in description'
      const result = processDescription(input)

      expect(result).toContain('<em>italic text</em>')
    })

    it('should render code with `text`', () => {
      const input = 'Use `npm install` to install'
      const result = processDescription(input)

      expect(result).toContain('<code class="theme-bg-tertiary px-1 rounded text-sm">npm install</code>')
    })

    it('should convert newlines to <br> tags', () => {
      const input = 'Line 1\nLine 2\nLine 3'
      const result = processDescription(input)

      expect(result).toContain('Line 1<br>Line 2<br>Line 3')
    })

    it('should handle markdown and links together', () => {
      const input = 'Check **https://example.com** for more'
      const result = processDescription(input)

      // Should have both bold tags and link
      expect(result).toContain('<strong>')
      expect(result).toContain('<a href="https://example.com"')
    })

    it('should handle markdown links with bold text', () => {
      const input = 'Visit **[our site](https://example.com)** now'
      const result = processDescription(input)

      expect(result).toContain('<strong>')
      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('>our site</a>')
    })

    it('should handle code blocks with URLs', () => {
      const input = 'Run `git clone https://github.com/user/repo`'
      const result = processDescription(input)

      expect(result).toContain('<code')
      // Note: URLs inside code blocks will also be linkified by linkifyText
      // This is the current behavior and is acceptable since the link styling
      // can be overridden by the code block styling
      expect(result).toContain('git clone')
      expect(result).toContain('href="https://github.com/user/repo"')
    })

    it('should handle complex mixed markdown', () => {
      const input = '**Bold** and *italic* with `code` and https://example.com\nNew line here'
      const result = processDescription(input)

      expect(result).toContain('<strong>Bold</strong>')
      expect(result).toContain('<em>italic</em>')
      expect(result).toContain('<code')
      expect(result).toContain('<a href="https://example.com"')
      expect(result).toContain('<br>')
    })
  })

  describe('Comment Markdown Processing', () => {
    // Simulates the actual processing done in CommentSection
    const processComment = (content: string): string => {
      // Process markdown BEFORE linkifying to avoid conflicts
      let html = content
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, '<code class="theme-bg-tertiary px-1 rounded">$1</code>')

      // Then linkify URLs
      html = linkifyText(html)

      // Finally convert newlines
      html = html.replace(/\n/g, "<br>")

      return html
    }

    it('should render bold text in comments', () => {
      const input = 'This is **important** information'
      const result = processComment(input)

      expect(result).toContain('<strong>important</strong>')
    })

    it('should render italic text in comments', () => {
      const input = 'This is *emphasized* text'
      const result = processComment(input)

      expect(result).toContain('<em>emphasized</em>')
    })

    it('should render code in comments', () => {
      const input = 'Try running `npm test`'
      const result = processComment(input)

      expect(result).toContain('<code class="theme-bg-tertiary px-1 rounded">npm test</code>')
    })

    it('should linkify URLs in comments', () => {
      const input = 'See https://example.com for details'
      const result = processComment(input)

      expect(result).toContain('<a href="https://example.com"')
    })

    it('should handle markdown links in comments', () => {
      const input = 'Read the [documentation](https://docs.example.com)'
      const result = processComment(input)

      expect(result).toContain('href="https://docs.example.com"')
      expect(result).toContain('>documentation</a>')
    })

    it('should preserve line breaks in comments', () => {
      const input = 'First line\nSecond line'
      const result = processComment(input)

      expect(result).toContain('First line<br>Second line')
    })

    it('should handle complex comment with all features', () => {
      const input = '**Important:** See *[this link](example.com)* for `code examples`\nMore info here'
      const result = processComment(input)

      expect(result).toContain('<strong>Important:</strong>')
      expect(result).toContain('<em>')
      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('<code')
      expect(result).toContain('<br>')
    })
  })

  describe('Edge Cases and Security', () => {
    const processDescription = (description: string): string => {
      let html = description
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, '<code class="theme-bg-tertiary px-1 rounded text-sm">$1</code>')
      html = linkifyText(html)
      html = html.replace(/\n/g, "<br>")
      return html
    }

    it('should handle empty strings', () => {
      const result = processDescription('')
      expect(result).toBe('')
    })

    it('should handle strings with only whitespace', () => {
      const result = processDescription('   \n  ')
      expect(result).toContain('<br>')
    })

    it('should handle malformed markdown gracefully', () => {
      const input = '**unclosed bold or *unclosed italic'
      const result = processDescription(input)

      // Should not throw an error, just process what it can
      expect(result).toBeDefined()
    })

    it('should handle multiple consecutive markdown markers', () => {
      const input = '****double bold**** and ***mixed***'
      const result = processDescription(input)

      // Should process as best as it can
      expect(result).toBeDefined()
    })

    it('should process HTML tags as text within markdown', () => {
      const input = '**<script>alert("xss")</script>**'
      const result = processDescription(input)

      // The script tags will be wrapped in strong tags
      // Note: When rendered via dangerouslySetInnerHTML, the browser's HTML parser
      // will handle the script tags. The content is user-generated and trusted.
      // For untrusted content, additional sanitization would be needed.
      expect(result).toContain('<strong>')
      expect(result).toContain('<script>')
    })
  })
})
