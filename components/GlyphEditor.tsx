

import React, { useState, useEffect, ChangeEvent } from 'react';
import { GlyphData } from '../types';

interface GlyphEditorProps {
  glyph: GlyphData;
  unitsPerEm: number;
  onUpdate: (updatedGlyph: GlyphData) => void;
  onClose: () => void;
  globalRulerY: number;
  onUpdateGlobalRulerY: (newY: number) => void;
  globalRulerX: number;
  onUpdateGlobalRulerX: (newX: number) => void;
}

const getReferenceLines = (unitsPerEm: number) => ({
  baseline: 0,
  descender: -Math.round(unitsPerEm * 0.22), 
  xHeight: Math.round(unitsPerEm * 0.45),    
  capHeight: Math.round(unitsPerEm * 0.70),  
  ascender: Math.round(unitsPerEm * 0.82),   
});


const GlyphEditor: React.FC<GlyphEditorProps> = ({ 
  glyph, 
  unitsPerEm, 
  onUpdate, 
  onClose,
  globalRulerY,
  onUpdateGlobalRulerY,
  globalRulerX,
  onUpdateGlobalRulerX,
}) => {
  const [yOffset, setYOffset] = useState<number>(glyph.yOffset);
  const [xOffset, setXOffset] = useState<number>(glyph.xOffset);
  const [scale, setScale] = useState<number>(glyph.scale);
  const [advanceWidth, setAdvanceWidth] = useState<number>(glyph.width || Math.round(unitsPerEm / 2));
  
  // const visualPixelHeight = glyph.visualHeight || unitsPerEm; 
  // const visualPixelWidth = glyph.visualWidth || Math.round(unitsPerEm/2); 

  useEffect(() => {
    setYOffset(glyph.yOffset);
    setXOffset(glyph.xOffset);
    setScale(glyph.scale);
    setAdvanceWidth(glyph.width || Math.round(unitsPerEm / 2));
  }, [glyph]);

  const handleYOffsetChange = (e: ChangeEvent<HTMLInputElement>) => {
    setYOffset(parseInt(e.target.value, 10) || 0);
  };

  const handleXOffsetChange = (e: ChangeEvent<HTMLInputElement>) => {
    setXOffset(parseInt(e.target.value, 10) || 0);
  };

  const handleScaleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setScale(parseFloat(e.target.value) || 1);
  };

  const handleAdvanceWidthChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAdvanceWidth(parseInt(e.target.value, 10) || 0);
  };

  const handleGlobalRulerYChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdateGlobalRulerY(parseInt(e.target.value, 10) || 0);
  };

  const handleGlobalRulerXChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdateGlobalRulerX(parseInt(e.target.value, 10) || 0);
  };

  const handleSave = () => {
    onUpdate({ ...glyph, xOffset, yOffset, scale, width: advanceWidth });
    onClose();
  };
  
  const refLines = getReferenceLines(unitsPerEm);

  const previewBoxHeight = unitsPerEm * 1.2; 
  const previewBaselineOffset = unitsPerEm * 0.2; 
  const previewHorizontalPadding = 10; 

  const imageBottomStyle = previewBaselineOffset + yOffset;
  const imageLeftStyle = previewHorizontalPadding + xOffset;

  const scaledImageHeight = (glyph.visualHeight || 0) * scale; // Use actual visual height for scaling
  const scaledImageWidth = (glyph.visualWidth || 0) * scale;   // Use actual visual width for scaling
  const scaledAdvanceWidth = advanceWidth * scale;

  const ghostCharacterBottom = previewBaselineOffset + refLines.descender;

  // const svgPathData = glyph.opentypePath ? glyph.opentypePath.toSVG(2) : '';
  
  // Use glyph's own visual dimensions for viewBox and transform if available, otherwise fallback to 1 to avoid zero dimensions.
  // const pathRenderWidth = glyph.visualWidth || 1;
  // const pathRenderHeight = glyph.visualHeight || 1;


  return (
    <div 
      className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="glyph-editor-title"
    >
      <div 
        className="bg-slate-800 p-6 rounded-lg shadow-2xl w-full max-w-2xl text-slate-100 relative"
        onClick={(e) => e.stopPropagation()} 
      >
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 text-2xl z-20"
          aria-label="Close editor"
        >&times;</button>

        <h2 id="glyph-editor-title" className="text-2xl font-bold text-sky-400 mb-6">
          Edit Glyph: <span className="font-mono text-emerald-400">{glyph.char === ' ' ? '[space]' : glyph.char}</span>
        </h2>

        {/* Preview Area */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">Preview (1 font unit = 1px in unscaled view)</h3>
          <div 
            className="relative bg-slate-700 border border-slate-600 w-full overflow-auto"
            style={{ height: `${previewBoxHeight}px`}}
            aria-hidden="true" 
          >
            {/* Ghost Character Guide */}
            {glyph.char !== ' ' && (
              <div
                style={{
                  position: 'absolute',
                  bottom: `${ghostCharacterBottom}px`,
                  left: `${previewHorizontalPadding}px`, 
                  fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
                  fontSize: `${unitsPerEm}px`,
                  lineHeight: `${unitsPerEm}px`, 
                  color: 'rgba(200, 220, 255, 0.10)', 
                  pointerEvents: 'none',
                  userSelect: 'none',
                  zIndex: 0, 
                  whiteSpace: 'pre', 
                }}
              >
                {glyph.char}
              </div>
            )}

            {/* Reference Lines - Horizontal */}
            <div className="absolute left-0 right-0 border-t border-dashed border-red-400 opacity-75" style={{ bottom: `${previewBaselineOffset}px`, zIndex: 1 }} title={`Baseline (y=0)`}>
              <span className="absolute -right-1 -top-2 text-xs text-red-400 transform translate-x-full bg-slate-700 px-0.5 rounded-sm">0</span>
            </div>
            <div className="absolute left-0 right-0 border-t border-dashed border-sky-400 opacity-50" style={{ bottom: `${previewBaselineOffset + refLines.descender}px`, zIndex: 1 }} title={`Descender (${refLines.descender})`}>
                <span className="absolute -right-1 -top-2 text-xs text-sky-400 transform translate-x-full bg-slate-700 px-0.5 rounded-sm">{refLines.descender}</span>
            </div>
            <div className="absolute left-0 right-0 border-t border-dashed border-green-400 opacity-50" style={{ bottom: `${previewBaselineOffset + refLines.xHeight}px`, zIndex: 1 }} title={`X-Height (${refLines.xHeight})`}>
                <span className="absolute -right-1 -top-2 text-xs text-green-400 transform translate-x-full bg-slate-700 px-0.5 rounded-sm">{refLines.xHeight}</span>
            </div>
            <div className="absolute left-0 right-0 border-t border-dashed border-yellow-400 opacity-50" style={{ bottom: `${previewBaselineOffset + refLines.capHeight}px`, zIndex: 1 }} title={`Cap-Height (${refLines.capHeight})`}>
                <span className="absolute -right-1 -top-2 text-xs text-yellow-400 transform translate-x-full bg-slate-700 px-0.5 rounded-sm">{refLines.capHeight}</span>
            </div>
            <div className="absolute left-0 right-0 border-t border-dashed border-purple-400 opacity-50" style={{ bottom: `${previewBaselineOffset + refLines.ascender}px`, zIndex: 1 }} title={`Ascender (${refLines.ascender})`}>
                <span className="absolute -right-1 -top-2 text-xs text-purple-400 transform translate-x-full bg-slate-700 px-0.5 rounded-sm">{refLines.ascender}</span>
            </div>
            
            {/* Global Y Ruler Line */}
            <div 
              className="absolute left-0 right-0 border-t border-dashed border-pink-500 opacity-90" 
              style={{ bottom: `${previewBaselineOffset + globalRulerY}px`, zIndex: 1 }} 
              title={`Global Y Ruler (${globalRulerY})`}
            >
              <span className="absolute -right-1 -top-2 text-xs text-pink-400 transform translate-x-full bg-slate-700 px-1 rounded">{globalRulerY}</span>
            </div>

            {/* Global X Ruler Line */}
            <div 
              className="absolute top-0 bottom-0 border-l border-dashed border-teal-500 opacity-90" 
              style={{ left: `${previewHorizontalPadding + globalRulerX}px`, zIndex: 1 }} 
              title={`Global X Ruler (${globalRulerX})`}
            >
              <span className="absolute -top-4 -right-0 text-xs text-teal-400 transform translate-x-1/2 bg-slate-700 px-1 rounded">{globalRulerX}</span>
            </div>
            
            {/* Glyph Image Preview */}
            {glyph.processedImageUrl && (
              <img
                src={glyph.processedImageUrl}
                alt={`Preview of ${glyph.char === ' ' ? 'space' : glyph.char}`}
                className="absolute preview-char-image" // Uses class from index.html for pixelation
                style={{
                  bottom: `${imageBottomStyle}px`,
                  left: `${imageLeftStyle}px`,
                  width: `${scaledImageWidth}px`,
                  height: `${scaledImageHeight}px`,
                  zIndex: 10,
                  // imageRendering: 'pixelated', // Alternative if class isn't applied or specific override needed
                }}
              />
            )}
            
            {/* Advance Width Guide Line */}
            <div 
                className="absolute top-0 bottom-0 border-l border-dashed border-orange-400 opacity-75" 
                style={{ left: `${imageLeftStyle + scaledAdvanceWidth}px`, zIndex: 5 }} 
                title={`Effective Advance Width (${scaledAdvanceWidth})`}
            >
                 <span className="absolute -top-4 -right-0 text-xs text-orange-400 whitespace-nowrap bg-slate-700 px-1 rounded">AW: {Math.round(scaledAdvanceWidth)}</span>
            </div>
          </div>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 mb-6">
          <div>
            <label htmlFor="xOffsetInput" className="block text-sm font-medium text-sky-300 mb-1">
              Glyph X Offset
            </label>
            <input
              type="number"
              id="xOffsetInput"
              value={xOffset}
              onChange={handleXOffsetChange}
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor="yOffsetInput" className="block text-sm font-medium text-sky-300 mb-1">
              Glyph Y Offset
            </label>
            <input
              type="number"
              id="yOffsetInput"
              value={yOffset}
              onChange={handleYOffsetChange}
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor="scaleInput" className="block text-sm font-medium text-sky-300 mb-1">
              Scale
            </label>
            <input
              type="number"
              id="scaleInput"
              value={scale}
              onChange={handleScaleChange}
              step="0.05"
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label htmlFor="advanceWidthInput" className="block text-sm font-medium text-sky-300 mb-1">
              Advance Width
            </label>
            <input
              type="number"
              id="advanceWidthInput"
              value={advanceWidth}
              onChange={handleAdvanceWidthChange}
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="md:col-start-1"> {/* Global Rulers on new line on medium screens */}
            <label htmlFor="globalRulerXInput" className="block text-sm font-medium text-teal-400 mb-1">
              Global Ruler X
            </label>
            <input
              type="number"
              id="globalRulerXInput"
              value={globalRulerX}
              onChange={handleGlobalRulerXChange}
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label htmlFor="globalRulerYInput" className="block text-sm font-medium text-pink-400 mb-1">
              Global Ruler Y
            </label>
            <input
              type="number"
              id="globalRulerYInput"
              value={globalRulerY}
              onChange={handleGlobalRulerYChange}
              className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-pink-500"
            />
          </div>
        </div>
        <div className="text-xs text-slate-500 mb-6 space-y-1">
            <p><strong>X/Y Offset:</strong> Moves glyph. Relative to origin (X) or baseline (Y).</p>
            <p><strong>Scale:</strong> Multiplies glyph size and advance width. 1 = no change.</p>
            <p><strong>Advance Width:</strong> Base width of glyph before scaling.</p>
            <p><strong>Global Rulers:</strong> Shared alignment guides across all glyphs.</p>
        </div>


        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlyphEditor;
