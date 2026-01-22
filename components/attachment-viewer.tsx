"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Image as ImageIcon, FileText, Download, X, ZoomIn, ZoomOut, RotateCcw, Play } from "lucide-react"
import { cn } from "@/lib/utils"

interface AttachmentViewerProps {
  url: string
  name: string
  type?: string
  size?: number
  className?: string
}

export function AttachmentViewer({ url, name, type, size, className }: AttachmentViewerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const isImage = url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) || type?.startsWith('image/')
  const isPdf = url.match(/\.pdf$/i) || type === 'application/pdf'
  const isVideo = url.match(/\.(mp4|mov|avi|webm|mkv)$/i) || type?.startsWith('video/')

  const resetTransform = () => {
    setZoom(1)
    setRotation(0)
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Download failed:', error)
      // Fallback to opening in new tab
      window.open(url, '_blank')
    }
  }

  const getThumbnail = () => {
    if (isImage) {
      return (
        <div className="relative group cursor-pointer">
          <img
            src={url}
            alt={name}
            className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg border-2 border-gray-600 group-hover:border-blue-400 transition-colors"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.nextElementSibling?.classList.remove('hidden')
            }}
          />
          <div className="hidden absolute inset-0 flex items-center justify-center bg-gray-700 rounded-lg border-2 border-gray-600 group-hover:border-blue-400 transition-colors">
            <ImageIcon className="w-6 h-6 text-gray-400" />
          </div>
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-colors flex items-center justify-center">
            <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      )
    }

    return (
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-700 rounded-lg border-2 border-gray-600 hover:border-blue-400 transition-colors flex items-center justify-center cursor-pointer group">
        {isPdf ? (
          <FileText className="w-6 h-6 text-red-400" />
        ) : isVideo ? (
          <Play className="w-6 h-6 text-purple-400" />
        ) : (
          <FileText className="w-6 h-6 text-gray-400" />
        )}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-colors flex items-center justify-center">
          <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    )
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size"
    
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsModalOpen(false)
    }
  }

  return (
    <>
      <div className={cn("", className)} data-testid="attachment-viewer">
        <div
          className="flex items-center space-x-2 sm:space-x-3 cursor-pointer"
          onClick={() => setIsModalOpen(true)}
        >
          {getThumbnail()}
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-white truncate">{name}</p>
            <p className="text-xs text-gray-400">{formatFileSize(size)}</p>
          </div>
        </div>
      </div>

      {/* Full Screen Modal */}
      {isModalOpen && typeof window !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]"
          onClick={() => setIsModalOpen(false)}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          <div
            className="relative w-full h-full max-w-7xl max-h-full mx-4 my-4 bg-gray-900 rounded-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900 flex-shrink-0">
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                {isImage ? (
                  <ImageIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
                ) : isPdf ? (
                  <FileText className="w-5 h-5 text-red-400 flex-shrink-0" />
                ) : isVideo ? (
                  <Play className="w-5 h-5 text-purple-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-5 h-5 text-green-400 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-white font-medium text-lg truncate">{name}</h2>
                  <p className="text-gray-400 text-sm">{formatFileSize(size)}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                {isImage && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                      className="text-gray-400 hover:text-white hidden sm:inline-flex"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                    <span className="text-gray-400 text-sm min-w-[3rem] text-center hidden sm:inline">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                      className="text-gray-400 hover:text-white hidden sm:inline-flex"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRotation(rotation + 90)}
                      className="text-gray-400 hover:text-white hidden sm:inline-flex"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={resetTransform}
                      className="text-gray-400 hover:text-white hidden sm:inline-flex"
                    >
                      Reset
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDownload}
                  className="text-gray-400 hover:text-white"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-white"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden bg-gray-800 flex items-center justify-center">
              {isImage ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={url}
                    alt={name}
                    className="max-w-full max-h-full object-contain transition-transform duration-200"
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transformOrigin: 'center'
                    }}
                  />
                </div>
              ) : isPdf ? (
                <div className="w-full h-full p-4">
                  <iframe
                    src={url}
                    className="w-full h-full border-0 rounded"
                    title={name}
                  />
                </div>
              ) : isVideo ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <video
                    src={url}
                    controls
                    className="max-w-full max-h-full"
                    style={{ maxHeight: '100%', maxWidth: '100%' }}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              ) : (
                <div className="text-center p-8">
                  <FileText className="w-20 h-20 text-gray-400 mx-auto mb-6" />
                  <h3 className="text-white text-xl font-medium mb-2">{name}</h3>
                  <p className="text-gray-400 mb-8">
                    Preview not available for this file type
                  </p>
                  <Button
                    onClick={handleDownload}
                    className="bg-blue-600 hover:bg-blue-700"
                    size="lg"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download File
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  )
}
