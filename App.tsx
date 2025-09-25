

import React, { useState, useCallback, ChangeEvent, useEffect, useRef } from 'react';
import { GlyphData, ProcessedCharacter } from './types';
import { fetchCharacterImage, processImage, imageDataToOpentypePath, assembleTtfFont, RENDER_SIZE } from './services/imageService';
import CharacterCard from './components/CharacterCard';
import GlyphEditor from './components/GlyphEditor';
import opentype, { Path as OpentypePath } from 'opentype.js';

const UPPERCASE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE_CHARS = "abcdefghijklmnopqrstuvwxyz";
const NUMBER_CHARS = "0123456789";
const BASIC_PUNCT_CHARS = " !@#$%^&*()_+-=[]{};':\",./<>?"; // Includes space
const ACCENTED_LATIN_CHARS = "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõøùúûüýþÿ";

const DEFAULT_CHARSET = `${UPPERCASE_CHARS}${LOWERCASE_CHARS}${NUMBER_CHARS}${BASIC_PUNCT_CHARS}`;
const LATIN_CHARSET_VALUE = `${DEFAULT_CHARSET}${ACCENTED_LATIN_CHARS}`;

const UNITS_PER_EM = 256;

const FONT_STYLE_TAG_ID = 'font-scraper-dynamic-style';
const TEST_FONT_FAMILY_CSS_NAME = "_FontScraperTestFont";
const DEFAULT_TEST_FONT_SIZE = 24;
const MIN_TEST_FONT_SIZE = 24;
const MAX_TEST_FONT_SIZE = 72;
const DEFAULT_TEST_STRING = "The quick brown fox jumps over the lazy dog. 12345!@#$%^&*()";

const PRESET_CHARSETS = [
  { name: "Basic", value: DEFAULT_CHARSET },
  { name: "Latin", value: LATIN_CHARSET_VALUE },
  { name: "Uppercase", value: UPPERCASE_CHARS },
  { name: "Lowercase", value: LOWERCASE_CHARS },
  { name: "Numbers", value: NUMBER_CHARS },
  { name: "Basic Punct.", value: BASIC_PUNCT_CHARS },
  { name: "Accented Latin", value: ACCENTED_LATIN_CHARS },
];

const PROJECT_FILE_FORMAT_VERSION = "1.0";
const APP_IDENTIFIER = "FontScraperProject";

interface SavedGlyph {
  id: string;
  char: string;
  status: 'pending' | 'fetching' | 'processing' | 'converting' | 'done' | 'error';
  imageUrl?: string;
  processedImageUrl?: string;
  opentypePathSVGData?: string; 
  width?: number;
  visualWidth?: number;
  visualHeight?: number;
  xOffset: number;
  yOffset: number;
  scale: number;
  errorMessage?: string;
}

interface ProjectFileFormat {
  fileFormatVersion: string;
  appIdentifier: typeof APP_IDENTIFIER;
  fontFamilyName: string;
  fontApiUrlInput: string; 
  charset: string;
  glyphs: SavedGlyph[];
  globalRulerX: number;
  globalRulerY: number;
  testString: string;
  testFontSize: number;
  unitsPerEm: number;
}

const App: React.FC = () => {
  // Modal States
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(true); // Initially true
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState<boolean>(false);
  const [pendingActionForUnsaved, setPendingActionForUnsaved] = useState<'new' | 'open' | null>(null);

  // Project Management State
  const [projectActive, setProjectActive] = useState<boolean>(false);
  const [newProjectNameInput, setNewProjectNameInput] = useState<string>("");
  const [newProjectApiUrlInput, setNewProjectApiUrlInput] = useState<string>("");
  const [newProjectFormError, setNewProjectFormError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Active Project State
  const [charset, setCharset] = useState<string>(DEFAULT_CHARSET);
  const [glyphsData, setGlyphsData] = useState<GlyphData[]>([]);
  const [fontFileUrl, setFontFileUrl] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [editingGlyph, setEditingGlyph] = useState<GlyphData | null>(null);
  const [testString, setTestString] = useState<string>(DEFAULT_TEST_STRING);
  const [testFontSize, setTestFontSize] = useState<number>(DEFAULT_TEST_FONT_SIZE);

  const [isFetchingChars, setIsFetchingChars] = useState<boolean>(false);
  const [isGeneratingTtf, setIsGeneratingTtf] = useState<boolean>(false);
  const [charactersFetchedSuccessfully, setCharactersFetchedSuccessfully] = useState<boolean>(false);
  const [isPreviewStale, setIsPreviewStale] = useState<boolean>(false);
  
  const [globalRulerY, setGlobalRulerY] = useState<number>(0);
  const [globalRulerX, setGlobalRulerX] = useState<number>(0);

  const [apiBaseUrlInput, setApiBaseUrlInput] = useState<string>("");
  const [currentApiBaseUrl, setCurrentApiBaseUrl] = useState<string>("");
  const [currentFontFamilyName, setCurrentFontFamilyName] = useState<string>("");
  const [apiUrlError, setApiUrlError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existingStyleTag = document.getElementById(FONT_STYLE_TAG_ID);
    if (existingStyleTag) existingStyleTag.remove();
  
    if (fontFileUrl && projectActive) {
      const style = document.createElement('style');
      style.id = FONT_STYLE_TAG_ID;
      style.textContent = `@font-face { font-family: '${TEST_FONT_FAMILY_CSS_NAME}'; src: url('${fontFileUrl}') format('truetype'); }`;
      document.head.appendChild(style);
      return () => {
        const styleTagToRemove = document.getElementById(FONT_STYLE_TAG_ID);
        if (styleTagToRemove) styleTagToRemove.remove();
      };
    }
    return undefined; 
  }, [fontFileUrl, projectActive]);


  const handleCharsetChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCharset(event.target.value);
    setCharactersFetchedSuccessfully(false); 
    if (fontFileUrl) { URL.revokeObjectURL(fontFileUrl); setFontFileUrl(null); setIsPreviewStale(false); }
    setHasUnsavedChanges(true);
  };

  const handlePresetCharsetClick = (presetValue: string) => {
    setCharset(presetValue);
    setCharactersFetchedSuccessfully(false);
    if (fontFileUrl) { URL.revokeObjectURL(fontFileUrl); setFontFileUrl(null); setIsPreviewStale(false); }
    setHasUnsavedChanges(true);
  };
  
  const extractBaseApiUrl = (fullUrl: string): string | null => {
    try {
      const urlObj = new URL(fullUrl);
      const pathRegex = /^\/render\/\d+\/font\/[a-f0-9]{32}$/i; 
      if (pathRegex.test(urlObj.pathname)) return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
      return null;
    } catch (e) { return null; }
  };

  const resetProjectState = (forNewProjectSetup: boolean = false) => {
    setCharset(DEFAULT_CHARSET);
    setGlyphsData([]);
    if (fontFileUrl) URL.revokeObjectURL(fontFileUrl);
    setFontFileUrl(null);
    setGlobalError(null);
    setProgress(0);
    setCharactersFetchedSuccessfully(false);
    setEditingGlyph(null);
    setApiUrlError(null);
    setIsPreviewStale(false);
    setTestString(DEFAULT_TEST_STRING);
    setTestFontSize(DEFAULT_TEST_FONT_SIZE);
    setGlobalRulerX(0);
    setGlobalRulerY(0);
    setHasUnsavedChanges(false);
    
    if (forNewProjectSetup) {
      setCurrentFontFamilyName("");
      setCurrentApiBaseUrl("");
      setApiBaseUrlInput("");
      setNewProjectNameInput("");
      setNewProjectApiUrlInput("");
      setNewProjectFormError(null);
    }
    // `projectActive` is handled by the calling function based on context
  };

  const prepareNewProjectModal = () => {
    resetProjectState(true); // Reset form fields and project data
    setProjectActive(false); // Ensure main editor is hidden
    setShowNewProjectModal(true);
  };
  
  const handleStartProjectCreationFromModal = () => {
    setNewProjectFormError(null);
    if (!newProjectNameInput.trim()) {
      setNewProjectFormError("Project Name cannot be empty.");
      return;
    }
    const extractedBaseUrl = extractBaseApiUrl(newProjectApiUrlInput);
    if (!extractedBaseUrl) {
      setNewProjectFormError("Invalid Font URL. Expected format: https://domain.com/render/APP_ID/font/MD5_HASH (query params will be ignored).");
      return;
    }

    setCurrentFontFamilyName(newProjectNameInput.trim());
    setCurrentApiBaseUrl(extractedBaseUrl);
    setApiBaseUrlInput(newProjectApiUrlInput);
    
    resetProjectState(false); // Reset common project states, but keep name/URL just set
    
    setProjectActive(true);
    setHasUnsavedChanges(false);
    setShowNewProjectModal(false);
  };

  const handleHeaderNewProjectClick = () => {
    if (projectActive && hasUnsavedChanges) {
      setPendingActionForUnsaved('new');
      setShowUnsavedChangesModal(true);
    } else {
      prepareNewProjectModal();
    }
  };
  
  const handleHeaderOpenProjectClick = () => {
    if (projectActive && hasUnsavedChanges) {
      setPendingActionForUnsaved('open');
      setShowUnsavedChangesModal(true);
    } else {
      handleTriggerOpenProjectDialog(); // Directly open if no unsaved changes or no active project
    }
  };

  const processActiveProjectApiUrlChange = () => {
    setApiUrlError(null);
    const extracted = extractBaseApiUrl(apiBaseUrlInput);
    if (extracted) {
      if (extracted !== currentApiBaseUrl) {
        setCurrentApiBaseUrl(extracted);
        setGlyphsData([]);
        if (fontFileUrl) URL.revokeObjectURL(fontFileUrl);
        setFontFileUrl(null);
        setIsPreviewStale(false);
        setCharactersFetchedSuccessfully(false);
        setProgress(0);
        setGlobalError(null);
        setHasUnsavedChanges(true);
      }
    } else {
      if (apiBaseUrlInput.trim()) { // Only show error if input is not empty
        setApiUrlError("Invalid Font URL format. Expected: https://domain.com/render/APP_ID/font/MD5_HASH. Query parameters will be ignored.");
      }
      // If URL becomes invalid, clear the currentApiBaseUrl to prevent fetches
      if (currentApiBaseUrl) {
        setCurrentApiBaseUrl("");
        setHasUnsavedChanges(true);
      }
    }
  };
  
  const handleActiveProjectFontFamilyNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newName = event.target.value;
    if (newName !== currentFontFamilyName) {
        setCurrentFontFamilyName(newName || "Untitled Font");
        if (fontFileUrl) { URL.revokeObjectURL(fontFileUrl); setFontFileUrl(null); setIsPreviewStale(true); }
        setHasUnsavedChanges(true);
    }
  };

  const handleTestStringChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setTestString(event.target.value);
    setHasUnsavedChanges(true);
  };

  const handleTestFontSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value, 10);
    if (!isNaN(newSize) && newSize >= MIN_TEST_FONT_SIZE && newSize <= MAX_TEST_FONT_SIZE) {
      setTestFontSize(newSize);
      setHasUnsavedChanges(true);
    }
  };

  const handleFetchAndProcessCharacters = useCallback(async () => {
    if (isFetchingChars || isGeneratingTtf || !currentApiBaseUrl || !currentFontFamilyName) {
      if (!currentApiBaseUrl || !currentFontFamilyName) {
        setGlobalError("Project details (Font URL or Font Name) are not set, or Font URL is invalid.");
      }
      return;
    }
  
    setIsFetchingChars(true);
    setGlobalError(null);
    if (fontFileUrl) {
      URL.revokeObjectURL(fontFileUrl);
      setFontFileUrl(null);
      setIsPreviewStale(false);
    }
    setGlyphsData([]);
    setCharactersFetchedSuccessfully(false);
    setProgress(0);
  
    const uniqueChars = Array.from(new Set(charset.split('')));
    const initialGlyphs: GlyphData[] = uniqueChars.map(char => ({
      id: `${char}-${Date.now()}-${Math.random()}`,
      char,
      status: 'pending',
      xOffset: 0,
      yOffset: 0,
      scale: 1,
      width: undefined,
      visualWidth: undefined,
      visualHeight: undefined,
    }));
    setGlyphsData(initialGlyphs);
  
    // --- STAGE 1: Fetch all characters and gather their vertical alignment data ---
    const intermediateResults: {
      id: string;
      char: string;
      processedData: ProcessedCharacter;
    }[] = [];
    const maxYValues: number[] = [];
  
    for (let i = 0; i < uniqueChars.length; i++) {
      const char = uniqueChars[i];
      const glyphToProcess = initialGlyphs[i];
  
      setGlyphsData(prev => prev.map(g => (g.id === glyphToProcess.id ? { ...g, status: 'fetching' } : g)));
      try {
        const image = await fetchCharacterImage(char, currentApiBaseUrl);
        setGlyphsData(prev => prev.map(g => (g.id === glyphToProcess.id ? { ...g, status: 'processing', imageUrl: image.src } : g)));
        const processedData = await processImage(image);
  
        if (processedData.maxY !== -1) { // Ignore empty chars for baseline calculation
          maxYValues.push(processedData.maxY);
        }
        intermediateResults.push({ id: glyphToProcess.id, char, processedData });
      } catch (error) {
        console.error(`Error processing character ${char}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setGlyphsData(prev => prev.map(g => (g.id === glyphToProcess.id ? { ...g, status: 'error', errorMessage } : g)));
      }
      setProgress(Math.round(((i + 1) / uniqueChars.length) * 50)); // First stage is 50% of progress
    }
  
    // --- Determine the baseline by finding the most common maxY value ---
    let baselineY = 0;
    if (maxYValues.length > 0) {
      const counts = maxYValues.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      baselineY = parseInt(Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b)));
    }
    
    if (isNaN(baselineY)) {
        // Fallback if no valid baseline found (e.g., all chars are errors)
        baselineY = RENDER_SIZE * 0.8; // A reasonable default assumption
        console.warn("Could not determine baseline from character data, using default fallback.");
    }
  
    // --- STAGE 2: Convert characters to vector paths with correct vertical offsets ---
    let anySuccess = false;
    for (let i = 0; i < intermediateResults.length; i++) {
      const { id, char, processedData } = intermediateResults[i];
      setGlyphsData(prev => prev.map(g => (g.id === id ? { ...g, status: 'converting' } : g)));
  
      try {
        // Calculate yOffset: distance from determined baseline to the character's bottom edge.
        // Positive y is "up" in font coordinates, so this correctly positions descenders (negative offset) and quotes (positive offset).
        const yOffset = baselineY - processedData.maxY;
  
        const { path, dataUrl } = imageDataToOpentypePath(processedData.imageData, processedData.height);
        let finalAdvanceWidth = processedData.width;
        if (char === ' ') finalAdvanceWidth = Math.floor(UNITS_PER_EM / 3);
  
        const finalGlyphData: GlyphData = {
          id,
          char,
          status: 'done',
          opentypePath: path,
          processedImageUrl: dataUrl,
          width: finalAdvanceWidth,
          visualWidth: processedData.width,
          visualHeight: processedData.height,
          xOffset: 0,
          yOffset: processedData.maxY === -1 ? 0 : yOffset, // Apply calculated offset, unless it's an empty char
          scale: 1,
        };
        setGlyphsData(prev => prev.map(g => (g.id === id ? finalGlyphData : g)));
        anySuccess = true;
      } catch (error) {
        console.error(`Error converting character ${char}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setGlyphsData(prev => prev.map(g => (g.id === id ? { ...g, status: 'error', errorMessage } : g)));
      }
      setProgress(50 + Math.round(((i + 1) / intermediateResults.length) * 50)); // Second stage is the other 50%
    }
  
    setCharactersFetchedSuccessfully(anySuccess);
    setIsFetchingChars(false);
    setIsPreviewStale(anySuccess);
    if (anySuccess) setHasUnsavedChanges(true);
  }, [charset, isFetchingChars, isGeneratingTtf, fontFileUrl, currentApiBaseUrl, currentFontFamilyName]);

  const handleAssembleFontFile = useCallback(async () => {
    if (isFetchingChars || isGeneratingTtf || !charactersFetchedSuccessfully || !currentFontFamilyName) return;
    setIsGeneratingTtf(true);
    setGlobalError(null);
    if (fontFileUrl) { URL.revokeObjectURL(fontFileUrl); setFontFileUrl(null); }
    const validGlyphsForAssembly = glyphsData.filter(g => g.status === 'done' && g.opentypePath && g.width !== undefined && g.visualHeight !== undefined);
    if (validGlyphsForAssembly.length === 0) {
      setGlobalError("No successfully processed characters available to generate a font.");
      setIsGeneratingTtf(false); setIsPreviewStale(true); return;
    }
    try {
      const fontAssemblyData = validGlyphsForAssembly.map(g => ({
          char: g.char, path: g.opentypePath as OpentypePath, width: g.width as number, 
          height: g.visualHeight as number, xOffset: g.xOffset, yOffset: g.yOffset, scale: g.scale,
      }));
      const fontArrayBuffer = assembleTtfFont(fontAssemblyData, currentFontFamilyName, UNITS_PER_EM);
      const blob = new Blob([fontArrayBuffer], { type: 'font/ttf' });
      const url = URL.createObjectURL(blob);
      setFontFileUrl(url); 
      setIsPreviewStale(false);
    } catch (e) {
      console.error("Error assembling TTF font:", e);
      setGlobalError(e instanceof Error ? e.message : String(e));
      setIsPreviewStale(true); 
    }
    setIsGeneratingTtf(false);
  }, [glyphsData, charactersFetchedSuccessfully, isFetchingChars, isGeneratingTtf, fontFileUrl, currentFontFamilyName]);

  const handleEditGlyph = (glyphId: string) => {
    const glyphToEdit = glyphsData.find(g => g.id === glyphId);
    if (glyphToEdit && glyphToEdit.status === 'done') setEditingGlyph(glyphToEdit);
  };

  const handleCloseEditor = () => setEditingGlyph(null);

  const handleUpdateGlyphDetails = (updatedGlyph: GlyphData) => {
    setGlyphsData(prevGlyphs => prevGlyphs.map(g => g.id === updatedGlyph.id ? updatedGlyph : g));
    setIsPreviewStale(true); 
    setHasUnsavedChanges(true);
  };

  const handleUpdateGlobalRulerY = (newY: number) => { setGlobalRulerY(newY); setHasUnsavedChanges(true); };
  const handleUpdateGlobalRulerX = (newX: number) => { setGlobalRulerX(newX); setHasUnsavedChanges(true); };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && editingGlyph) handleCloseEditor(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingGlyph]);

  const hasDoneGlyphs = glyphsData.some(g => g.status === 'done');

  const serializeGlyphPath = (path: OpentypePath | undefined): string | undefined => {
    if (!path || !path.commands || path.commands.length === 0) return undefined;
    try { return path.toPathData(2); } catch (e) { console.error("Error serializing path:", e); return undefined; }
  };

  const handleSaveProject = async () => {
    if (!projectActive || !currentFontFamilyName) {
      setGlobalError("Cannot save: No active project or project name is missing.");
      return;
    }
    const savedGlyphs: SavedGlyph[] = glyphsData.map(g => ({
      ...g, opentypePath: undefined, opentypePathSVGData: serializeGlyphPath(g.opentypePath),
    }));
    const projectData: ProjectFileFormat = {
      fileFormatVersion: PROJECT_FILE_FORMAT_VERSION, appIdentifier: APP_IDENTIFIER,
      fontFamilyName: currentFontFamilyName, fontApiUrlInput: apiBaseUrlInput, charset: charset,
      glyphs: savedGlyphs, globalRulerX: globalRulerX, globalRulerY: globalRulerY,
      testString: testString, testFontSize: testFontSize, unitsPerEm: UNITS_PER_EM,
    };
    
    try {
      const jsonString = JSON.stringify(projectData, null, 2);
      const filename = `${currentFontFamilyName.replace(/\s+/g, '_') || 'FontScraper_Project'}.scrap`;
      let saveSuccessful = false;

      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Font Scraper Project',
              accept: { 'application/json': ['.scrap'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonString);
          await writable.close();
          saveSuccessful = true;
        } catch (pickerError: any) {
          console.warn("window.showSaveFilePicker failed. Error name:", pickerError.name, "Message:", pickerError.message);
          if (pickerError.name === 'AbortError') {
            console.info("Save dialog (showSaveFilePicker) was cancelled by the user.");
            return; // User cancelled, do not proceed to fallback or show error.
          }
          // For other errors (e.g., SecurityError for cross-origin iframes),
          // saveSuccessful remains false, and we will proceed to the fallback.
          console.info("Attempting fallback save method due to showSaveFilePicker error.");
        }
      }

      if (!saveSuccessful) {
        // Fallback for browsers that don't support showSaveFilePicker OR if showSaveFilePicker failed
        console.info("Using fallback save method (createObjectURL).");
        const blob = new Blob([jsonString], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        saveSuccessful = true; // Mark as successful after fallback
      }

      if (saveSuccessful) {
        setGlobalError(null);
        setHasUnsavedChanges(false);
      }
      // If still not successful, an error message might already be set by an outer catch,
      // or we might need a specific one if both methods are exhausted without success.
      // However, the current structure aims for the fallback to generally succeed if the picker fails for non-cancellation reasons.

    } catch (error: any) {
      // This outer catch handles errors from JSON.stringify or other critical setup issues.
      // AbortError from the picker is handled above.
      console.error("Error during save project operation (outer catch):", error);
      setGlobalError(`Failed to save project: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleTriggerOpenProjectDialog = () => fileInputRef.current?.click();

  const handleOpenProjectFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setGlobalError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const projectData = JSON.parse(text) as ProjectFileFormat;
        if (projectData.appIdentifier !== APP_IDENTIFIER) throw new Error("Invalid project file: Not a FontScraper project.");
        if (projectData.fileFormatVersion !== PROJECT_FILE_FORMAT_VERSION) console.warn(`Opening project version ${projectData.fileFormatVersion}, app version ${PROJECT_FILE_FORMAT_VERSION}.`);
        
        resetProjectState(true); // Reset form fields and common project states

        setCurrentFontFamilyName(projectData.fontFamilyName);
        setApiBaseUrlInput(projectData.fontApiUrlInput);
        const extractedBase = extractBaseApiUrl(projectData.fontApiUrlInput);
        if (extractedBase) setCurrentApiBaseUrl(extractedBase);
        else { setCurrentApiBaseUrl(""); setApiUrlError("Font URL from loaded project is invalid."); }

        setCharset(projectData.charset);
        setGlobalRulerX(projectData.globalRulerX);
        setGlobalRulerY(projectData.globalRulerY);
        setTestString(projectData.testString);
        setTestFontSize(projectData.testFontSize);
        
        const loadedGlyphs: GlyphData[] = projectData.glyphs.map(sg => {
          let opPath: OpentypePath | undefined = undefined;
          if (sg.opentypePathSVGData) {
            try {
              opPath = new opentype.Path();
              (opPath as any).pathData = sg.opentypePathSVGData; 
            } catch (pathError) {
              console.error(`Error deserializing path for char ${sg.char}:`, pathError);
              sg.status = 'error'; sg.errorMessage = `Failed to load path: ${pathError instanceof Error ? pathError.message : String(pathError)}`;
            }
          }
          return {
            ...(sg as Omit<SavedGlyph, 'opentypePathSVGData'>), id: sg.id, char: sg.char, status: sg.status,
            imageUrl: sg.imageUrl, processedImageUrl: sg.processedImageUrl, width: sg.width,
            visualWidth: sg.visualWidth, visualHeight: sg.visualHeight, xOffset: sg.xOffset,
            yOffset: sg.yOffset, scale: sg.scale, errorMessage: sg.errorMessage, opentypePath: opPath,
          };
        });
        setGlyphsData(loadedGlyphs);
        setCharactersFetchedSuccessfully(loadedGlyphs.some(g => g.status === 'done'));
        setIsPreviewStale(loadedGlyphs.some(g => g.status === 'done'));
        setProjectActive(true);
        setHasUnsavedChanges(false);
        setShowNewProjectModal(false); // Close modal on successful load
      } catch (error) {
        console.error("Error opening project:", error);
        setGlobalError(`Failed to open project: ${error instanceof Error ? error.message : String(error)}`);
        setProjectActive(false); 
        setShowNewProjectModal(true); // Show modal again if error
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => { setGlobalError(`Error reading file: ${reader.error}`); setProjectActive(false); setShowNewProjectModal(true); };
    reader.readAsText(file);
  };

  const proceedWithPendingAction = () => {
    if (pendingActionForUnsaved === 'new') {
      prepareNewProjectModal();
    } else if (pendingActionForUnsaved === 'open') {
      handleTriggerOpenProjectDialog();
    }
    setPendingActionForUnsaved(null);
  };

  const handleUnsavedChangesDecision = (action: 'cancel' | 'save' | 'dontsave') => {
    if (action === 'cancel') {
      setPendingActionForUnsaved(null);
    } else if (action === 'save') {
      handleSaveProject().then(() => { // Ensure save completes before proceeding
        // Only proceed if save was successful (hasUnsavedChanges is false)
        if (!hasUnsavedChanges) {
          proceedWithPendingAction();
        }
      });
    } else if (action === 'dontsave') {
      resetProjectState(true); // Reset everything, including hasUnsavedChanges
      setProjectActive(false); // Ensure main app is hidden for new/open
      proceedWithPendingAction();
    }
    setShowUnsavedChangesModal(false);
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-slate-100 p-4 sm:p-8 flex flex-col items-center">
      <input type="file" ref={fileInputRef} onChange={handleOpenProjectFileSelected} accept=".scrap" style={{ display: 'none' }} />
      
      {/* App Header */}
      <header className="mb-8 text-center w-full max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 mb-2 sm:mb-0">
            Font Scraper
            </h1>
            <div className="flex flex-col sm:flex-row gap-2">
                <button
                    onClick={handleSaveProject}
                    disabled={!projectActive || !hasUnsavedChanges}
                    className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Save current project to a .scrap file"
                >
                    Save Project
                </button>
                <button
                    onClick={handleHeaderOpenProjectClick}
                    className="px-4 py-2 text-sm bg-slate-600 hover:bg-sky-700 text-sky-200 hover:text-white font-semibold rounded-md transition-colors"
                    title="Open an existing .scrap project file"
                >
                    Open Project
                </button>
                <button
                    onClick={handleHeaderNewProjectClick}
                    className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-sky-500 text-sky-300 hover:text-sky-200 rounded-md transition-colors"
                    title="Start a brand new font project"
                >
                    New Project
                </button>
            </div>
        </div>
        {projectActive && (
          <p className="text-slate-400 max-w-2xl mx-auto">
            Crafting: <strong className="text-emerald-300">{currentFontFamilyName || "Untitled Font"}</strong>. Define charset, fetch, edit glyphs, and generate your TTF.
            {hasUnsavedChanges && <span className="text-yellow-400 ml-2">(Unsaved Changes)</span>}
          </p>
        )}
      </header>

      {/* Main Application Content (only if project is active) */}
      {projectActive && (
        <main className="w-full max-w-4xl bg-slate-800 shadow-2xl rounded-xl p-6 sm:p-8">
          <section className="mb-8 p-6 bg-slate-850 rounded-lg border border-slate-700" aria-labelledby="font-config-heading">
            <h3 id="font-config-heading" className="text-xl font-semibold text-sky-300 mb-4">Active Font Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="activeFontApiUrlInput" className="block text-sm font-medium text-sky-300 mb-1">Font URL:</label>
                <input type="url" id="activeFontApiUrlInput" value={apiBaseUrlInput} 
                  onChange={(e) => { setApiBaseUrlInput(e.target.value); if (apiUrlError) setApiUrlError(null); }}
                  onBlur={processActiveProjectApiUrlChange}
                  className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500 placeholder-slate-500"
                  placeholder="Font URL (full for one char)" />
                {apiUrlError && <p className="text-xs text-red-400 mt-1" role="alert">{apiUrlError}</p>}
              </div>
              <div>
                <label htmlFor="activeFontFamilyNameInput" className="block text-sm font-medium text-sky-300 mb-1">Font Family Name:</label>
                <input type="text" id="activeFontFamilyNameInput" value={currentFontFamilyName} onChange={handleActiveProjectFontFamilyNameChange}
                  className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500 placeholder-slate-500"
                  placeholder="e.g., My Awesome Font" />
              </div>
            </div>
          </section>

          <section className="mb-8" aria-labelledby="charset-label">
            <label id="charset-label" htmlFor="charsetInput" className="block text-lg font-semibold text-sky-300 mb-2">
              Character Set for <em className="text-emerald-400">{currentFontFamilyName || "Untitled Font"}</em>:
            </label>
            <div className="mb-3 flex flex-wrap gap-2">
              {PRESET_CHARSETS.map(preset => (
                <button key={preset.name} onClick={() => handlePresetCharsetClick(preset.value)}
                  className="px-3 py-1 text-xs bg-slate-600 hover:bg-sky-600 text-sky-200 hover:text-white rounded-md transition-colors"
                  title={`Set charset to: ${preset.name}`}>
                  {preset.name}
                </button>
              ))}
            </div>
            <textarea id="charsetInput" value={charset} onChange={handleCharsetChange} rows={4}
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow placeholder-slate-500"
              placeholder="Enter characters like ABCabc123!@#..."
              disabled={isFetchingChars || isGeneratingTtf || !currentApiBaseUrl || !currentFontFamilyName} />
          </section>

          <section className="mb-8 text-center flex flex-col sm:flex-row justify-center items-center gap-4">
            <button onClick={handleFetchAndProcessCharacters}
              disabled={isFetchingChars || isGeneratingTtf || !charset.trim() || !currentApiBaseUrl || !currentFontFamilyName}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-bold rounded-lg shadow-lg transform transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 w-full sm:w-auto"
              aria-live="polite" aria-busy={isFetchingChars}>
              {isFetchingChars ? ( <div className="flex items-center justify-center"> <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg> Fetching Characters ({progress}%) </div> ) : ( 'Fetch & Process Characters' )}
            </button>
            <button onClick={handleAssembleFontFile}
              disabled={isFetchingChars || isGeneratingTtf || !charactersFetchedSuccessfully || !hasDoneGlyphs || !currentFontFamilyName}
              className="px-6 py-3 bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-600 hover:to-emerald-600 text-white font-bold rounded-lg shadow-lg transform transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-opacity-75 w-full sm:w-auto"
              aria-live="polite" aria-busy={isGeneratingTtf}>
              {isGeneratingTtf ? ( <div className="flex items-center justify-center"> <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg> Generating TTF... </div> ) : ( 'Generate TTF Font' )}
            </button>
          </section>
          
          {isFetchingChars && ( <div className="w-full bg-slate-700 rounded-full h-2.5 mb-4 dark:bg-slate-600" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Character fetching progress"> <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div> </div> )}
          {globalError && ( <div className="mb-6 p-4 bg-red-800 border border-red-700 text-red-200 rounded-lg" role="alert"> <h3 className="font-semibold mb-1">Error:</h3> <p className="text-sm">{globalError}</p> </div> )}
          {fontFileUrl && ( <div className="mb-6 p-6 bg-emerald-800 border border-emerald-700 rounded-lg text-center"> <h3 className="text-xl font-semibold text-emerald-200 mb-3">Your TTF Font "{currentFontFamilyName || 'Untitled Font'}" is Ready!</h3> <p className="text-sm text-emerald-300 mb-3"> If you've edited glyphs, changed charset, or font name/URL after the last generation, click "Generate TTF Font" again. </p> <a href={fontFileUrl} download={`${(currentFontFamilyName || 'Untitled_Font').replace(/\s+/g, '_')}.ttf`} className="inline-block px-6 py-2 bg-gradient-to-r from-green-400 to-lime-500 hover:from-green-500 hover:to-lime-600 text-slate-900 font-semibold rounded-lg shadow-md transition-transform transform hover:scale-105"> Download {(currentFontFamilyName || 'Untitled Font')}.ttf </a> </div> )}
          {fontFileUrl && isPreviewStale && ( <div className="mb-6 p-4 bg-yellow-700 border border-yellow-600 text-yellow-100 rounded-lg" role="alert"> <h3 className="font-semibold mb-1">Preview Notice:</h3> <p className="text-sm">The current font preview may not reflect recent glyph, name, or Font URL edits. Please click "Generate TTF Font" again to see your latest changes.</p> </div> )}
          {fontFileUrl && ( <section className="mt-8 mb-6 p-6 bg-slate-800 shadow-lg rounded-lg border border-slate-700" aria-labelledby="font-test-heading"> <h3 id="font-test-heading" className="text-xl font-semibold text-sky-300 mb-4">Test Your Font: <em className="text-emerald-400">{currentFontFamilyName || "Untitled Font"}</em></h3> <textarea value={testString} onChange={handleTestStringChange} rows={3} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow placeholder-slate-500 mb-4" placeholder="Type here to test your font..." aria-label="Text input to test the generated font" /> <div className="mb-4"> <label htmlFor="testFontSizeInput" className="block text-sm font-medium text-sky-300 mb-1"> Font Size: <span className="font-semibold text-emerald-400">{testFontSize}px</span> </label> <input type="range" id="testFontSizeInput" value={testFontSize} onChange={handleTestFontSizeChange} min={MIN_TEST_FONT_SIZE} max={MAX_TEST_FONT_SIZE} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75" aria-label={`Font size for testing, current value ${testFontSize} pixels`} /> </div> <div className="p-4 bg-white text-black rounded-md min-h-[100px]" style={{ fontFamily: `${TEST_FONT_FAMILY_CSS_NAME}, 'Helvetica Neue', Helvetica, Arial, sans-serif`, fontSize: `${testFontSize}px`, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.4' }} aria-label="Font test display area"> {testString || " "} </div> </section> )}
          {glyphsData.length > 0 && ( <section aria-labelledby="glyphs-heading" className="mt-8"> <h3 id="glyphs-heading" className="text-xl font-semibold text-sky-300 mb-4">Character Glyphs for <em className="text-emerald-400">{currentFontFamilyName || "Untitled Font"}</em>:</h3> <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"> {glyphsData.map((glyph) => ( <CharacterCard key={glyph.id} glyph={glyph} onEdit={glyph.status === 'done' ? () => handleEditGlyph(glyph.id) : undefined} /> ))} </div> </section> )}
        </main>
      )}

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 shadow-2xl rounded-xl p-8 sm:p-12 w-full max-w-lg">
            <header className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-sky-400 mb-2">Setup New Font Project</h2>
              <p className="text-slate-400">Provide a name and Font URL to begin.</p>
            </header>
            <div className="space-y-6">
              <div>
                <label htmlFor="modalProjectName" className="block text-sm font-medium text-sky-300 mb-1">Project Name (Font Family):</label>
                <input type="text" id="modalProjectName" value={newProjectNameInput} onChange={(e) => setNewProjectNameInput(e.target.value)}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500 placeholder-slate-500"
                  placeholder="e.g., My Awesome Font" />
              </div>
              <div>
                <label htmlFor="modalProjectApiUrl" className="block text-sm font-medium text-sky-300 mb-1">Font URL (full URL for one character):</label>
                <input type="url" id="modalProjectApiUrl" value={newProjectApiUrlInput} 
                  onChange={(e) => { setNewProjectApiUrlInput(e.target.value); if (newProjectFormError) setNewProjectFormError(null); }}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-1 focus:ring-sky-500 placeholder-slate-500"
                  placeholder="e.g., https://sig.monotype.com/render/105/font/MD5?rt=A&..." />
                <p className="text-xs text-slate-500 mt-1">Paste the full URL for any character. We'll extract the base part needed.</p>
              </div>
              {newProjectFormError && (<p className="text-sm text-red-400" role="alert">{newProjectFormError}</p>)}
              <button onClick={handleStartProjectCreationFromModal} disabled={!newProjectNameInput.trim() || !newProjectApiUrlInput.trim()}
                className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-bold rounded-lg shadow-lg transform transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">
                Start Scraping
              </button>
              <div className="relative flex py-3 items-center">
                <div className="flex-grow border-t border-slate-600"></div><span className="flex-shrink mx-4 text-slate-500">Or</span><div className="flex-grow border-t border-slate-600"></div>
              </div>
              <button onClick={() => { setShowNewProjectModal(false); handleTriggerOpenProjectDialog(); }}
                className="w-full px-6 py-3 bg-slate-600 hover:bg-sky-700 text-sky-200 hover:text-white font-semibold rounded-lg shadow-lg transform transition-all hover:scale-105">
                Open Existing Project (.scrap)
              </button>
               {globalError && !projectActive && ( <p className="text-sm text-red-400 mt-4 text-center" role="alert">{globalError}</p> )}
            </div>
            <p className="mt-8 text-center text-xs text-slate-500">
                Tool created by Krisp and enhanced by Heitor Spectre
            </p>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedChangesModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-80 backdrop-blur-md flex items-center justify-center p-4 z-[60]"> {/* Higher z-index */}
            <div className="bg-slate-800 shadow-2xl rounded-xl p-8 w-full max-w-md">
                <h3 className="text-xl font-semibold text-yellow-400 mb-4">Unsaved Changes</h3>
                <p className="text-slate-300 mb-6">You have unsaved changes. What would you like to do?</p>
                <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <button onClick={() => handleUnsavedChangesDecision('cancel')}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium rounded-md transition-colors order-3 sm:order-1">
                        Cancel
                    </button>
                    <button onClick={() => handleUnsavedChangesDecision('dontsave')}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors order-2 sm:order-2">
                        Don't Save & Proceed
                    </button>
                    <button onClick={() => handleUnsavedChangesDecision('save')}
                        className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md transition-colors order-1 sm:order-3">
                        Save & Proceed
                    </button>
                </div>
            </div>
        </div>
      )}

      {editingGlyph && projectActive && ( 
        <GlyphEditor
          glyph={editingGlyph} unitsPerEm={UNITS_PER_EM} onUpdate={handleUpdateGlyphDetails} onClose={handleCloseEditor}
          globalRulerY={globalRulerY} onUpdateGlobalRulerY={handleUpdateGlobalRulerY}
          globalRulerX={globalRulerX} onUpdateGlobalRulerX={handleUpdateGlobalRulerX}
        />
      )}

      <footer className="mt-12 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} Font Scraper. Pixels to vectors, with love.</p>
      </footer>
    </div>
  );
};

export default App;