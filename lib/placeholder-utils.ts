// Utility for working with generated placeholder images

export const PASTEL_COLORS = {
  // Soft pastels
  lavender: '#E6E6FA',
  mint: '#F0FFF0', 
  peach: '#FFEAA7',
  coral: '#FFB3BA',
  sky: '#AED6F1',
  sage: '#C8E6C9',
  rose: '#F8BBD9',
  butter: '#FFF9C4',
  periwinkle: '#CCCCFF',
  seafoam: '#B2DFDB',
  apricot: '#FFE0B2',
  lilac: '#E1BEE7',
  
  // Slightly more vibrant pastels
  blush: '#FFB7C5',
  powder: '#B0E0E6',
  cream: '#F5F5DC',
  pearl: '#F0F0F0',
} as const

export type PastelColorName = keyof typeof PASTEL_COLORS

export interface PlaceholderOption {
  name: PastelColorName
  color: string
  path: string
  label: string
}

/**
 * Get all available placeholder options
 */
export function getPlaceholderOptions(): PlaceholderOption[] {
  return Object.entries(PASTEL_COLORS).map(([name, color]) => ({
    name: name as PastelColorName,
    color,
    path: `/images/placeholders/${name}.png`,
    label: name.charAt(0).toUpperCase() + name.slice(1)
  }))
}

/**
 * Get a default placeholder image based on list name
 */
export function getDefaultPlaceholder(listName: string): PlaceholderOption {
  const options = getPlaceholderOptions()
  
  // Use a simple hash to pick a consistent color for the list name
  let hash = 0
  for (let i = 0; i < listName.length; i++) {
    hash = ((hash << 5) - hash + listName.charCodeAt(i)) & 0xffffffff
  }
  
  const index = Math.abs(hash) % options.length
  return options[index]
}

/**
 * Get placeholder by color name
 */
export function getPlaceholderByName(colorName: PastelColorName): PlaceholderOption {
  const color = PASTEL_COLORS[colorName]
  return {
    name: colorName,
    color,
    path: `/images/placeholders/${colorName}.png`,
    label: colorName.charAt(0).toUpperCase() + colorName.slice(1)
  }
}

/**
 * Check if a URL is a placeholder image
 */
export function isPlaceholderImage(imageUrl: string): boolean {
  return imageUrl.includes('/images/placeholders/') || imageUrl.startsWith('data:image/')
}

/**
 * Get the fallback placeholder (default when nothing is selected)
 */
export function getFallbackPlaceholder(): PlaceholderOption {
  return getPlaceholderByName('sky') // Light blue as default
}