/**
 * Export a DOM element as a self-contained inline HTML file
 * Suitable for email attachments where external CSS won't load
 */

// CSS variables to resolve (from globals.css)
const CSS_VARIABLES = [
  'bg-page', 'bg-card', 'bg-muted', 'bg-hover', 'bg-selected',
  'text-primary', 'text-secondary', 'text-muted',
  'accent', 'accent-hover', 'accent-light', 'accent-text',
  'positive', 'positive-light', 'positive-text',
  'negative', 'negative-light', 'negative-text',
  'warning', 'warning-light', 'warning-text',
  'info', 'info-light', 'info-text',
  'border', 'border-light',
  'shadow-sm', 'shadow-md', 'shadow-lg',
  'chart-1', 'chart-2', 'chart-3', 'chart-4',
  'chart-5', 'chart-6', 'chart-7', 'chart-8',
]

/**
 * Get computed CSS variable values from the document
 */
function getCSSVariableValues() {
  const styles = getComputedStyle(document.documentElement)
  const values = {}

  CSS_VARIABLES.forEach(name => {
    const value = styles.getPropertyValue(`--${name}`).trim()
    if (value) {
      values[`--${name}`] = value
    }
  })

  return values
}

/**
 * Replace CSS variable references with actual values
 */
function resolveVariables(cssText, variables) {
  let resolved = cssText

  Object.entries(variables).forEach(([varName, value]) => {
    // Match var(--name) and var(--name, fallback)
    const regex = new RegExp(`var\\(${varName}(?:,[^)]*)?\\)`, 'g')
    resolved = resolved.replace(regex, value)
  })

  return resolved
}

/**
 * Get all computed styles for an element as inline style string
 */
function getInlineStyles(element, variables) {
  const computed = getComputedStyle(element)
  const dominated = [
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-width', 'border-style', 'border-color', 'border-radius',
    'background', 'background-color', 'background-image',
    'color', 'font-family', 'font-size', 'font-weight', 'line-height',
    'text-align', 'text-decoration', 'letter-spacing',
    'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap',
    'grid-template-columns', 'grid-template-rows', 'grid-gap',
    'overflow', 'opacity', 'box-shadow', 'transform',
    'white-space', 'word-break', 'text-overflow',
  ]

  const styles = []
  dominated.forEach(prop => {
    const value = computed.getPropertyValue(prop)
    if (value && value !== 'none' && value !== 'auto' && value !== 'normal' && value !== '0px') {
      let resolved = resolveVariables(value, variables)
      styles.push(`${prop}: ${resolved}`)
    }
  })

  return styles.join('; ')
}

/**
 * Clone element with inline styles
 */
function cloneWithInlineStyles(element, variables) {
  const clone = element.cloneNode(false)

  // Skip script, style, and hidden elements
  if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
    return null
  }

  // Skip elements marked as no-print or print-hide
  if (element.classList?.contains('no-print') ||
      element.hasAttribute?.('data-print-hide') ||
      element.tagName === 'NAV' ||
      element.tagName === 'BUTTON') {
    return null
  }

  // Apply inline styles
  if (element.nodeType === Node.ELEMENT_NODE) {
    const inlineStyle = getInlineStyles(element, variables)
    if (inlineStyle) {
      clone.setAttribute('style', inlineStyle)
    }

    // Remove class attribute (styles are now inline)
    clone.removeAttribute('class')

    // Keep important attributes
    const keepAttrs = ['id', 'src', 'alt', 'href', 'width', 'height', 'viewBox', 'd', 'fill', 'stroke']
    Array.from(clone.attributes || []).forEach(attr => {
      if (!keepAttrs.includes(attr.name) && attr.name !== 'style') {
        clone.removeAttribute(attr.name)
      }
    })
  }

  // Process children
  element.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      clone.appendChild(document.createTextNode(child.textContent))
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const clonedChild = cloneWithInlineStyles(child, variables)
      if (clonedChild) {
        clone.appendChild(clonedChild)
      }
    }
  })

  return clone
}

/**
 * Convert SVG charts to inline images for better email compatibility
 * Falls back to inline SVG with explicit dimensions if canvas fails
 */
async function svgsToImages(container) {
  const svgs = Array.from(container.querySelectorAll('svg'))

  for (const svg of svgs) {
    try {
      // Get dimensions before any manipulation
      const width = svg.clientWidth || svg.getBoundingClientRect().width || 300
      const height = svg.clientHeight || svg.getBoundingClientRect().height || 200

      // Clone SVG and set explicit dimensions (needed for serialization)
      const svgClone = svg.cloneNode(true)
      svgClone.setAttribute('width', width)
      svgClone.setAttribute('height', height)
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

      // Try canvas conversion first
      try {
        const svgData = new XMLSerializer().serializeToString(svgClone)
        const svgBase64 = btoa(unescape(encodeURIComponent(svgData)))
        const dataUrl = `data:image/svg+xml;base64,${svgBase64}`

        const img = new Image()
        img.crossOrigin = 'anonymous'

        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          setTimeout(reject, 5000) // 5s timeout
          img.src = dataUrl
        })

        const canvas = document.createElement('canvas')
        canvas.width = width * 2 // 2x for retina
        canvas.height = height * 2

        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(2, 2)
        ctx.drawImage(img, 0, 0, width, height)

        const imgElement = document.createElement('img')
        imgElement.src = canvas.toDataURL('image/png', 0.95)
        imgElement.alt = 'Chart'
        imgElement.style.cssText = `width: ${width}px; height: ${height}px; display: block;`

        svg.parentNode?.replaceChild(imgElement, svg)
      } catch (canvasError) {
        // Fallback: keep SVG but inline it with explicit styles
        console.warn('Canvas conversion failed, using inline SVG:', canvasError)

        // Add inline styles to SVG for email compatibility
        svgClone.style.cssText = `width: ${width}px; height: ${height}px; display: block;`

        svg.parentNode?.replaceChild(svgClone, svg)
      }
    } catch (e) {
      console.warn('SVG processing failed, keeping original:', e)
      // Keep original SVG - better than nothing
    }
  }
}

/**
 * Generate complete HTML document
 */
function generateHtmlDocument(content, title, options = {}) {
  const { includeTimestamp = true } = options
  const timestamp = includeTimestamp
    ? `<p style="color: #71717A; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E4E4E7;">Generated on ${new Date().toLocaleString()}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    /* Reset for email clients */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #18181B;
      background-color: #FAFAFA;
    }
    img {
      border: 0;
      max-width: 100%;
      height: auto;
    }
    table {
      border-collapse: collapse;
    }
    /* Container */
    .email-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
      background-color: #FFFFFF;
    }
  </style>
</head>
<body>
  <div class="email-container">
    ${content}
    ${timestamp}
  </div>
</body>
</html>`
}

/**
 * Export element as downloadable HTML file
 * @param {HTMLElement|string} target - Element or selector to export
 * @param {Object} options - Export options
 * @param {string} options.filename - Output filename (default: 'report.html')
 * @param {string} options.title - Document title
 * @param {boolean} options.convertSvgs - Convert SVGs to images (default: true)
 * @param {boolean} options.includeTimestamp - Add generation timestamp (default: true)
 */
export async function exportToHtml(target, options = {}) {
  const {
    filename = 'report.html',
    title = 'Report',
    convertSvgs = true,
    includeTimestamp = true,
  } = options

  // Get target element
  const element = typeof target === 'string'
    ? document.querySelector(target)
    : target

  if (!element) {
    throw new Error('Export target element not found')
  }

  // Get CSS variable values
  const variables = getCSSVariableValues()

  // Clone with inline styles
  const cloned = cloneWithInlineStyles(element, variables)

  if (!cloned) {
    throw new Error('Failed to clone element for export')
  }

  // Create temporary container
  const container = document.createElement('div')
  container.appendChild(cloned)

  // Convert SVGs to images if requested
  if (convertSvgs) {
    await svgsToImages(container)
  }

  // Generate HTML document
  const html = generateHtmlDocument(container.innerHTML, title, { includeTimestamp })

  // Create download
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.html') ? filename : `${filename}.html`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)

  return { success: true, filename: link.download }
}

/**
 * Get HTML string without downloading (for programmatic use)
 */
export async function getHtmlString(target, options = {}) {
  const {
    title = 'Report',
    convertSvgs = true,
    includeTimestamp = true,
  } = options

  const element = typeof target === 'string'
    ? document.querySelector(target)
    : target

  if (!element) {
    throw new Error('Export target element not found')
  }

  const variables = getCSSVariableValues()
  const cloned = cloneWithInlineStyles(element, variables)

  if (!cloned) {
    throw new Error('Failed to clone element for export')
  }

  const container = document.createElement('div')
  container.appendChild(cloned)

  if (convertSvgs) {
    await svgsToImages(container)
  }

  return generateHtmlDocument(container.innerHTML, title, { includeTimestamp })
}
