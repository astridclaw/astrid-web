import { describe, it, expect } from 'vitest'
import { linkifyText } from '@/lib/utils'

describe('linkifyText', () => {
  it('should convert http URLs to clickable links', () => {
    const text = 'Check out http://example.com for more info'
    const result = linkifyText(text)

    expect(result).toContain('<a href="http://example.com"')
    expect(result).toContain('target="_blank"')
    expect(result).toContain('rel="noopener noreferrer"')
    expect(result).toContain('>http://example.com</a>')
  })

  it('should convert https URLs to clickable links', () => {
    const text = 'Visit https://www.github.com/anthropics'
    const result = linkifyText(text)

    expect(result).toContain('<a href="https://www.github.com/anthropics"')
    expect(result).toContain('>https://www.github.com/anthropics</a>')
  })

  it('should convert www URLs to clickable links with https protocol', () => {
    const text = 'Go to www.example.com'
    const result = linkifyText(text)

    expect(result).toContain('<a href="https://www.example.com"')
    expect(result).toContain('>www.example.com</a>')
  })

  it('should handle multiple URLs in the same text', () => {
    const text = 'Check http://example.com and https://github.com'
    const result = linkifyText(text)

    expect(result).toContain('href="http://example.com"')
    expect(result).toContain('href="https://github.com"')
  })

  it('should handle URLs with query parameters', () => {
    const text = 'Search at https://google.com?q=test&page=1'
    const result = linkifyText(text)

    // & is escaped to &amp; for HTML safety
    expect(result).toContain('href="https://google.com?q=test&amp;page=1"')
  })

  it('should handle URLs with fragments', () => {
    const text = 'Read the docs at https://example.com/docs#section'
    const result = linkifyText(text)

    expect(result).toContain('href="https://example.com/docs#section"')
  })

  it('should not linkify text without URLs', () => {
    const text = 'This is just plain text'
    const result = linkifyText(text)

    expect(result).toBe(text)
    expect(result).not.toContain('<a')
  })

  it('should preserve text around URLs', () => {
    const text = 'Before https://example.com after'
    const result = linkifyText(text)

    expect(result).toContain('Before')
    expect(result).toContain('after')
    expect(result).toContain('<a href="https://example.com"')
  })

  it('should handle URLs at the start of text', () => {
    const text = 'https://example.com is a website'
    const result = linkifyText(text)

    expect(result).toContain('<a href="https://example.com"')
    expect(result).toContain('is a website')
  })

  it('should handle URLs at the end of text', () => {
    const text = 'Visit https://example.com'
    const result = linkifyText(text)

    expect(result).toContain('<a href="https://example.com"')
  })

  it('should not include trailing punctuation in URLs', () => {
    const text = 'Check https://example.com.'
    const result = linkifyText(text)

    expect(result).toContain('href="https://example.com"')
    expect(result).not.toContain('href="https://example.com."')
    expect(result).toContain('</a>.')
  })

  it('should not include trailing punctuation like commas', () => {
    const text = 'Sites like https://example.com, https://github.com'
    const result = linkifyText(text)

    expect(result).toContain('href="https://example.com"')
    expect(result).not.toContain('href="https://example.com,"')
  })

  it('should handle URLs with paths', () => {
    const text = 'Read https://example.com/docs/getting-started'
    const result = linkifyText(text)

    expect(result).toContain('href="https://example.com/docs/getting-started"')
  })

  it('should apply proper CSS classes for styling', () => {
    const text = 'Visit https://example.com'
    const result = linkifyText(text)

    expect(result).toContain('class="text-blue-600 dark:text-blue-400 hover:underline"')
  })

  it('should handle empty strings', () => {
    const result = linkifyText('')
    expect(result).toBe('')
  })

  it('should handle URLs in parentheses without including closing paren', () => {
    const text = 'Check this (https://example.com) out'
    const result = linkifyText(text)

    expect(result).toContain('href="https://example.com"')
    expect(result).not.toContain('href="https://example.com)"')
    expect(result).toContain('</a>) out')
  })

  it('should handle URLs with ports', () => {
    const text = 'Local server at http://localhost:3000'
    const result = linkifyText(text)

    expect(result).toContain('href="http://localhost:3000"')
  })

  it('should handle complex URLs with multiple path segments', () => {
    const text = 'API docs at https://api.example.com/v1/users/123/profile'
    const result = linkifyText(text)

    expect(result).toContain('href="https://api.example.com/v1/users/123/profile"')
  })

  describe('Plain domain support', () => {
    it('should linkify plain domains without protocol or www', () => {
      const text = 'Visit google.com for search'
      const result = linkifyText(text)

      expect(result).toContain('<a href="https://google.com"')
      expect(result).toContain('>google.com</a>')
      expect(result).toContain('target="_blank"')
    })

    it('should linkify example.com', () => {
      const text = 'Go to example.com'
      const result = linkifyText(text)

      expect(result).toContain('<a href="https://example.com"')
      expect(result).toContain('>example.com</a>')
    })

    it('should handle plain domains with paths', () => {
      const text = 'Check github.com/anthropics'
      const result = linkifyText(text)

      expect(result).toContain('<a href="https://github.com/anthropics"')
      expect(result).toContain('>github.com/anthropics</a>')
    })
  })

  describe('Markdown link support', () => {
    it('should convert markdown links to HTML links', () => {
      const text = 'Check out [Example](https://example.com) for more info'
      const result = linkifyText(text)

      expect(result).toContain('<a href="https://example.com"')
      expect(result).toContain('>Example</a>')
      expect(result).toContain('target="_blank"')
      expect(result).toContain('rel="noopener noreferrer"')
    })

    it('should NOT double-linkify markdown links', () => {
      const text = '[google.com](google.com)'
      const result = linkifyText(text)

      // Should create exactly ONE link, not nested links
      expect(result).toBe('<a href="https://google.com" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">google.com</a>')

      // Should NOT contain malformed HTML
      expect(result).not.toContain('<a href="<a')
      expect(result).not.toContain('</a>"')
    })

    it('should NOT show HTML attributes as visible text', () => {
      const text = '[Example](https://example.com)'
      const result = linkifyText(text)

      // Visible text should only be "Example", not include target/rel attributes
      expect(result).toMatch(/>Example<\/a>/)
      expect(result).not.toMatch(/Example.*target="_blank".*<\/a>/)
    })

    it('should convert markdown links with www URLs', () => {
      const text = 'Visit [My Site](www.example.com)'
      const result = linkifyText(text)

      expect(result).toContain('<a href="https://www.example.com"')
      expect(result).toContain('>My Site</a>')
    })

    it('should handle multiple markdown links', () => {
      const text = 'Check [Google](https://google.com) and [GitHub](https://github.com)'
      const result = linkifyText(text)

      expect(result).toContain('href="https://google.com"')
      expect(result).toContain('>Google</a>')
      expect(result).toContain('href="https://github.com"')
      expect(result).toContain('>GitHub</a>')
    })

    it('should handle markdown links with text around them', () => {
      const text = 'Before [Link](https://example.com) after'
      const result = linkifyText(text)

      expect(result).toContain('Before')
      expect(result).toContain('after')
      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('>Link</a>')
    })

    it('should handle markdown links with special characters in text', () => {
      const text = 'Read [Example & More!](https://example.com)'
      const result = linkifyText(text)

      // & is escaped to &amp; for HTML safety
      expect(result).toContain('>Example &amp; More!</a>')
    })

    it('should handle markdown links with query parameters', () => {
      const text = 'Search [Google Results](https://google.com?q=test&page=1)'
      const result = linkifyText(text)

      // & is escaped to &amp; for HTML safety
      expect(result).toContain('href="https://google.com?q=test&amp;page=1"')
    })

    it('should handle both markdown links and plain URLs in the same text', () => {
      const text = 'Check [Example](https://example.com) and also https://github.com'
      const result = linkifyText(text)

      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('>Example</a>')
      expect(result).toContain('href="https://github.com"')
      expect(result).toContain('>https://github.com</a>')
    })

    it('should handle markdown links with paths', () => {
      const text = 'Read [Documentation](https://example.com/docs/getting-started)'
      const result = linkifyText(text)

      expect(result).toContain('href="https://example.com/docs/getting-started"')
    })

    it('should handle markdown links with fragments', () => {
      const text = 'Jump to [Section](https://example.com#introduction)'
      const result = linkifyText(text)

      expect(result).toContain('href="https://example.com#introduction"')
    })

    it('should preserve markdown link text exactly as written', () => {
      const text = 'Visit [Click Here For More Information](https://example.com)'
      const result = linkifyText(text)

      expect(result).toContain('>Click Here For More Information</a>')
    })
  })
})
