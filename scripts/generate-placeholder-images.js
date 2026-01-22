#!/usr/bin/env node

const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const PASTEL_COLORS = {
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
}

const OUTPUT_DIR = path.join(__dirname, '../public/images/placeholders')
const SIZE = 128 // 128x128 pixels

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function generatePlaceholderImage(colorName, color) {
  console.log(`Generating placeholder for ${colorName} (${color})...`)
  
  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')
  
  // Fill with solid color
  ctx.fillStyle = color
  ctx.fillRect(0, 0, SIZE, SIZE)
  
  // Optional: Add a subtle pattern or gradient for more visual interest
  // Create a very subtle radial gradient
  const gradient = ctx.createRadialGradient(SIZE/2, SIZE/2, 0, SIZE/2, SIZE/2, SIZE/2)
  gradient.addColorStop(0, color)
  
  // Make the outer edge slightly darker
  const rgb = hexToRgb(color)
  if (rgb) {
    const darkerColor = `rgba(${Math.max(0, rgb.r - 10)}, ${Math.max(0, rgb.g - 10)}, ${Math.max(0, rgb.b - 10)}, 0.1)`
    gradient.addColorStop(1, darkerColor)
  }
  
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)
  
  // Save as PNG
  const buffer = canvas.toBuffer('image/png')
  const filename = `${colorName}.png`
  const filepath = path.join(OUTPUT_DIR, filename)
  
  fs.writeFileSync(filepath, buffer)
  console.log(`✅ Created ${filename}`)
  
  return {
    name: colorName,
    color,
    filename,
    path: `/images/placeholders/${filename}`
  }
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

// Generate all placeholder images
console.log('🎨 Generating placeholder images...')
const placeholders = []

for (const [colorName, color] of Object.entries(PASTEL_COLORS)) {
  const placeholder = generatePlaceholderImage(colorName, color)
  placeholders.push(placeholder)
}

// Create metadata file
const metadataPath = path.join(OUTPUT_DIR, 'index.json')
fs.writeFileSync(metadataPath, JSON.stringify(placeholders, null, 2))
console.log(`📋 Created metadata file: ${metadataPath}`)

console.log(`✨ Generated ${placeholders.length} placeholder images!`)