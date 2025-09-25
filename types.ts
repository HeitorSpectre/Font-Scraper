import type { Path } from 'opentype.js';

export interface GlyphData {
  id: string; // Unique ID for React key, can be char + timestamp
  char: string;
  status: 'pending' | 'fetching' | 'processing' | 'converting' | 'done' | 'error';
  imageUrl?: string; // Original image from API
  processedImageUrl?: string; // Cropped image data URL for preview
  opentypePath?: Path; // opentype.js Path object for this glyph
  width?: number; // advanceWidth of the glyph
  height?: number; // DEPRECATED: use visualHeight. Was original pixel height of the processed character image.
  visualWidth?: number; // original pixel width of the processed character image
  visualHeight?: number; // original pixel height of the processed character image
  xOffset: number; // Horizontal offset from the origin (in font units). Positive moves right.
  yOffset: number; // Vertical offset from the baseline (in font units). Positive moves up.
  scale: number; // Scaling factor, 1.0 means no scale.
  errorMessage?: string;
}

export interface ProcessedCharacter {
  char: string;
  imageData: ImageData; // Cropped image data
  width: number; // pixel width of processed image
  height: number; // pixel height of processed image
  maxY: number; // The y-coordinate of the bottom of the bounding box in the original image canvas. -1 for empty images.
}