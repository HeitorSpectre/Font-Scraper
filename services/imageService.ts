
import { ProcessedCharacter } from '../types';
import opentype, { Path } from 'opentype.js'; 
// import type { GlyphData } from '../types'; // GlyphData not directly used here.


export const RENDER_SIZE = 256; // Used for 'rs' parameter in Monotype API
const API_WIDTH_PARAM = 512; // Used for 'w' parameter in Monotype API
const FOREGROUND_COLOR = "000000";
const BACKGROUND_COLOR_API = "FFFFFF"; 

const BG_COLOR_R = 255;
const BG_COLOR_G = 255;
const BG_COLOR_B = 255;
const BG_COLOR_TOLERANCE = 15; 

export async function fetchCharacterImage(char: string, apiBaseUrl: string): Promise<HTMLImageElement> {
  const encodedChar = encodeURIComponent(char);
  // Construct full URL by appending parameters to the provided base URL
  const url = `${apiBaseUrl}?rt=${encodedChar}&rs=${RENDER_SIZE}&fg=${FOREGROUND_COLOR}&bg=${BACKGROUND_COLOR_API}&w=${API_WIDTH_PARAM}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(`Failed to load image for character: ${char} using base URL: ${apiBaseUrl}. Error: ${JSON.stringify(err)}`);
    img.src = url;
  });
}

export async function processImage(image: HTMLImageElement): Promise<ProcessedCharacter> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  ctx.drawImage(image, 0, 0);

  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;

  for (let y_coord = 0; y_coord < canvas.height; y_coord++) {
    for (let x_coord = 0; x_coord < canvas.width; x_coord++) {
      const i = (y_coord * canvas.width + x_coord) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        r >= BG_COLOR_R - BG_COLOR_TOLERANCE && r <= BG_COLOR_R + BG_COLOR_TOLERANCE &&
        g >= BG_COLOR_G - BG_COLOR_TOLERANCE && g <= BG_COLOR_G + BG_COLOR_TOLERANCE &&
        b >= BG_COLOR_B - BG_COLOR_TOLERANCE && b <= BG_COLOR_B + BG_COLOR_TOLERANCE
      ) {
        data[i + 3] = 0; // Make background transparent
      } else {
        // This is a foreground pixel
        if (x_coord < minX) minX = x_coord;
        if (x_coord > maxX) maxX = x_coord;
        if (y_coord < minY) minY = y_coord;
        if (y_coord > maxY) maxY = y_coord;
      }
    }
  }
  
  // Update the canvas with the modified imageData (with transparent background)
  ctx.putImageData(imageData, 0, 0);

  // Handle cases where the image is entirely background (empty character)
  if (maxX === -1 || maxY === -1) { 
    // Return a 1x1 transparent image for empty characters like space
    const emptyImageData = ctx.createImageData(1, 1); 
    // Ensure it's fully transparent
    emptyImageData.data[3] = 0; 
    return { char: ' ', imageData: emptyImageData, width: 1, height: 1, maxY: -1 };
  }

  const croppedWidth = Math.max(1, maxX - minX + 1);
  const croppedHeight = Math.max(1, maxY - minY + 1);

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = croppedWidth;
  croppedCanvas.height = croppedHeight;
  const croppedCtx = croppedCanvas.getContext('2d', { willReadFrequently: true });
  if (!croppedCtx) {
    throw new Error('Failed to get 2D context from cropped canvas');
  }
  
  // Get the cropped image data directly from the original canvas (ctx), 
  // which now has the transparent background.
  const newCroppedImageData = ctx.getImageData(minX, minY, croppedWidth, croppedHeight);
  
  return { char: '', imageData: newCroppedImageData, width: croppedWidth, height: croppedHeight, maxY: maxY };
}

export function imageDataToOpentypePath(
  imageData: ImageData,
  charPixelHeight: number // This is visualHeight of the character from its own bounding box.
): { path: opentype.Path, dataUrl: string } {
  const path = new opentype.Path();
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get context for PNG/Path generation');
  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');

  // Iterate over each pixel of the imageData
  for (let y_img = 0; y_img < imageData.height; y_img++) {
    let x_img = 0;
    while (x_img < imageData.width) {
      const i = (y_img * imageData.width + x_img) * 4;
      const alpha = imageData.data[i + 3]; // Alpha channel

      if (alpha > 128) { // Consider pixel opaque if alpha is greater than 128
        // Start of a horizontal run of opaque pixels
        let runStart_x_img = x_img;
        while (x_img < imageData.width && imageData.data[(y_img * imageData.width + x_img) * 4 + 3] > 128) {
          x_img++;
        }
        let runEnd_x_img = x_img -1; // End of the run (inclusive)

        // Convert image coordinates to OpenType path coordinates
        // Image Y is from top-down. Path Y is from baseline-up.
        // charPixelHeight is the height of the character's visual bounding box (imageData.height)
        // This makes the path relative to the bottom-left of the character's own box.
        const path_y_bottom = charPixelHeight - 1 - y_img; // Bottom edge of pixel rectangle
        const path_y_top = charPixelHeight - y_img;      // Top edge of pixel rectangle

        path.moveTo(runStart_x_img, path_y_bottom);
        path.lineTo(runEnd_x_img + 1, path_y_bottom); // +1 to cover the full pixel width
        path.lineTo(runEnd_x_img + 1, path_y_top);
        path.lineTo(runStart_x_img, path_y_top);
        path.closePath();
      } else {
        x_img++; // Move to next pixel if current is transparent
      }
    }
  }
  return { path, dataUrl };
}

interface FontAssemblyGlyphData {
  char: string;
  path: opentype.Path; 
  width: number; // This is the advance width (unscaled)
  height: number; // This is visualHeight, mainly for context, not direct font metrics like ascent/descent
  xOffset: number;
  yOffset: number;
  scale: number;
}

function clonePath(originalPath: opentype.Path): opentype.Path {
  const newPath = new opentype.Path();
  if (originalPath && originalPath.commands) {
    newPath.commands = originalPath.commands.map(cmd => ({ ...cmd })); 
    newPath.fill = originalPath.fill;
    newPath.stroke = originalPath.stroke;
    newPath.strokeWidth = originalPath.strokeWidth;
  }
  return newPath;
}

function scalePath(path: opentype.Path, scaleFactor: number, originX: number = 0, originY: number = 0): void {
  if (!path || !path.commands || scaleFactor === 1) {
    return;
  }
  path.commands.forEach(cmd => {
    const command = cmd as any; // opentype.js types can be a bit loose here
    if (typeof command.x === 'number') command.x = originX + (command.x - originX) * scaleFactor;
    if (typeof command.y === 'number') command.y = originY + (command.y - originY) * scaleFactor;
    if (typeof command.x1 === 'number') command.x1 = originX + (command.x1 - originX) * scaleFactor;
    if (typeof command.y1 === 'number') command.y1 = originY + (command.y1 - originY) * scaleFactor;
    if (typeof command.x2 === 'number') command.x2 = originX + (command.x2 - originX) * scaleFactor;
    if (typeof command.y2 === 'number') command.y2 = originY + (command.y2 - originY) * scaleFactor;
  });
}

function translatePath(path: opentype.Path, dx: number, dy: number): void {
  if (!path || !path.commands || (dx === 0 && dy === 0)) {
    return;
  }
  path.commands.forEach(cmd => {
    const command = cmd as any; 
    if (typeof command.x === 'number') command.x += dx;
    if (typeof command.y === 'number') command.y += dy;
    if (typeof command.x1 === 'number') command.x1 += dx;
    if (typeof command.y1 === 'number') command.y1 += dy;
    if (typeof command.x2 === 'number') command.x2 += dx;
    if (typeof command.y2 === 'number') command.y2 += dy;
  });
}

export function assembleTtfFont(
  glyphsData: FontAssemblyGlyphData[], 
  fontFamily: string, 
  unitsPerEm: number
): ArrayBuffer {
  
  // Define font metrics based on unitsPerEm
  // These are common ratios, but could be made configurable or smarter
  const ascent = Math.round(unitsPerEm * 0.85); // Suggested distance from baseline to top of glyphs
  const descent = -Math.round(unitsPerEm * 0.15); // Suggested distance from baseline to bottom of glyphs (negative)

  const otGlyphs: opentype.Glyph[] = [];

  // .notdef glyph (mandatory)
  const notdefPath = new opentype.Path();
  const notdefAdvanceWidth = Math.round(unitsPerEm / 2); // A reasonable default for undefined characters
  const notdefBoxWidth = notdefAdvanceWidth / 2;
  const notdefBoxHeight = Math.round(ascent * 0.7);
  notdefPath.moveTo(0, 0); 
  notdefPath.lineTo(notdefBoxWidth, 0);
  notdefPath.lineTo(notdefBoxWidth, notdefBoxHeight);
  notdefPath.lineTo(0, notdefBoxHeight);
  notdefPath.closePath();
  
  otGlyphs.push(new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: notdefAdvanceWidth,
    path: notdefPath,
  }));

  // Space glyph
  // Check if a space glyph was processed, if so use its scaled width, otherwise a default.
  const spaceGlyphEntry = glyphsData.find(g => g.char === ' ');
  let spaceAdvanceWidth = Math.floor(unitsPerEm / 3); // Default space width
  if (spaceGlyphEntry) {
      // Use the advance width defined for the space character, scaled
      spaceAdvanceWidth = Math.max(1, Math.round(spaceGlyphEntry.width * spaceGlyphEntry.scale));
  }

  otGlyphs.push(new opentype.Glyph({
    name: 'space',
    unicode: ' '.charCodeAt(0),
    advanceWidth: spaceAdvanceWidth,
    path: new opentype.Path() // Space glyph typically has no visual path
  }));

  // Add other glyphs
  glyphsData.forEach(glyph => {
    if (glyph.char === ' ') return; // Space already handled

    const unicode = glyph.char.charCodeAt(0);
    if (isNaN(unicode)) {
      console.warn(`Skipping character with invalid charCode: ${glyph.char}`);
      return;
    }
    
    let finalPath: Path;
    if (glyph.path instanceof Path && glyph.path.commands && glyph.path.commands.length > 0) {
        finalPath = clonePath(glyph.path);
        // Apply transformations: scale first around origin (0,0 of glyph's local coordinates), then translate
        scalePath(finalPath, glyph.scale); // Scale around (0,0) of the glyph's path itself
        translatePath(finalPath, glyph.xOffset, glyph.yOffset);
    } else {
        console.warn(`Glyph '${glyph.char}' (unicode: ${unicode}) does not have a valid opentype.Path object or path is empty. Using an empty path.`);
        finalPath = new opentype.Path(); 
        // Even for an empty path, apply transforms if they exist, though it won't change an empty path
        scalePath(finalPath, glyph.scale);
        translatePath(finalPath, glyph.xOffset, glyph.yOffset);
    }
    
    // Calculate advance width: use the glyph's defined width, scaled. Fallback if width is undefined.
    const advanceWidth = Math.max(1, Math.round((glyph.width || Math.round(unitsPerEm / 2)) * glyph.scale));

    otGlyphs.push(new opentype.Glyph({
      name: glyph.char,
      unicode: unicode,
      advanceWidth: advanceWidth,
      path: finalPath,
    }));
  });

  const font = new opentype.Font({
    familyName: fontFamily,
    styleName: 'Medium', // Or make this configurable
    unitsPerEm: unitsPerEm,
    ascender: ascent, 
    descender: descent,
    glyphs: otGlyphs,
  });

  return font.toArrayBuffer();
}