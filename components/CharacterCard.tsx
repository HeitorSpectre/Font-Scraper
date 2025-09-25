import React from 'react';
import { GlyphData } from '../types';

interface CharacterCardProps {
  glyph: GlyphData;
  onEdit?: (glyphId: string) => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ glyph, onEdit }) => {
  const getStatusColor = () => {
    switch (glyph.status) {
      case 'pending': return 'bg-gray-200 text-gray-700';
      case 'fetching': return 'bg-blue-200 text-blue-700 animate-pulse';
      case 'processing': return 'bg-yellow-200 text-yellow-700 animate-pulse';
      case 'converting': return 'bg-purple-200 text-purple-700 animate-pulse';
      case 'done': return 'bg-green-200 text-green-700';
      case 'error': return 'bg-red-200 text-red-700';
      default: return 'bg-gray-300';
    }
  };

  const isEditable = glyph.status === 'done' && onEdit;

  return (
    <div 
      className={`bg-white p-3 rounded-lg shadow-md flex flex-col items-center text-center transform transition-all hover:scale-105 ${isEditable ? 'cursor-pointer hover:ring-2 hover:ring-sky-400' : 'cursor-default'}`}
      onClick={isEditable ? () => onEdit(glyph.id) : undefined}
      onKeyDown={isEditable ? (e) => (e.key === 'Enter' || e.key === ' ') && onEdit(glyph.id) : undefined}
      tabIndex={isEditable ? 0 : -1}
      role={isEditable ? "button" : undefined}
      aria-label={isEditable ? `Edit character ${glyph.char === ' ' ? 'space' : glyph.char}` : `Character ${glyph.char === ' ' ? 'space' : glyph.char}`}
    >
      <div className="text-4xl font-mono mb-2 h-12 flex items-center justify-center">{glyph.char === ' ' ? '[space]' : glyph.char}</div>
      <div className={`text-xs px-2 py-1 rounded-full ${getStatusColor()} mb-2`}>
        {glyph.status}
      </div>
      
      {glyph.processedImageUrl && (glyph.status === 'done' || glyph.status === 'converting') && (
        <div className="mt-2">
          <h4 className="text-xs font-semibold text-gray-600 mb-1">Preview:</h4>
          <img 
            src={glyph.processedImageUrl} 
            alt={`Processed ${glyph.char}`} 
            className="w-16 h-16 object-contain preview-char-image border border-gray-300 bg-gray-50"
            style={{ imageRendering: 'pixelated' }}
            aria-label={`Pixelated preview of character ${glyph.char === ' ' ? 'space' : glyph.char}`}
          />
        </div>
      )}
      {isEditable && <p className="text-xs text-sky-600 mt-1">Click to edit</p>}
      {glyph.errorMessage && (
        <p className="text-xs text-red-500 mt-1 break-all" role="alert">{glyph.errorMessage}</p>
      )}
    </div>
  );
};

export default CharacterCard;