import { useState, useRef, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ArrowRight,
  Type,
  Square,
  Crop,
  Hash,
  Undo,
  Save,
  X,
  Trash2,
  Circle,
} from 'lucide-react';
import './AnnotationEditor.css';

export interface Annotation {
  id: string;
  type: 'arrow' | 'text' | 'rectangle' | 'number';
  color: string;
  strokeWidth: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  endX?: number;
  endY?: number;
  fill?: boolean;
}

interface AnnotationEditorProps {
  imagePath: string;
  onSave: (annotatedImageData: string) => Promise<void>;
  onCancel: () => void;
}

type Tool = 'arrow' | 'text' | 'rectangle' | 'crop' | 'number' | 'none';

export function AnnotationEditor({ imagePath, onSave, onCancel }: AnnotationEditorProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [currentTool, setCurrentTool] = useState<Tool>('none');
  const [color, setColor] = useState('#3b82f6');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [numberCounter, setNumberCounter] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [cropRegion, setCropRegion] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
    };
    img.src = convertFileSrc(imagePath);
  }, [imagePath]);

  const addToHistory = (newAnnotations: Annotation[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newAnnotations]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setAnnotations(newAnnotations);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setAnnotations([...history[newIndex]]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setAnnotations([...history[newIndex]]);
    }
  };

  const handleClearAll = () => {
    if (annotations.length > 0 && confirm('Clear all annotations?')) {
      addToHistory([]);
    }
  };

  const getCanvasCoordinates = (e: React.MouseEvent): { x: number; y: number } => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * imageDimensions.width;
    const y = ((e.clientY - rect.top) / rect.height) * imageDimensions.height;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (currentTool === 'none' || editingTextId) return;
    
    const pos = getCanvasCoordinates(e);
    setStartPos(pos);
    setCurrentPos(pos);
    setIsDrawing(true);

    if (currentTool === 'text') {
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'text',
        color,
        strokeWidth,
        x: pos.x,
        y: pos.y,
        text: '',
      };
      const newAnnotations = [...annotations, newAnnotation];
      addToHistory(newAnnotations);
      setEditingTextId(newAnnotation.id);
      setIsDrawing(false);
    } else if (currentTool === 'number') {
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'number',
        color,
        strokeWidth,
        x: pos.x,
        y: pos.y,
        text: numberCounter.toString(),
      };
      const newAnnotations = [...annotations, newAnnotation];
      addToHistory(newAnnotations);
      setNumberCounter(numberCounter + 1);
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos) return;
    const pos = getCanvasCoordinates(e);
    setCurrentPos(pos);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPos || !currentPos) {
      setIsDrawing(false);
      return;
    }

    if (currentTool === 'arrow') {
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'arrow',
        color,
        strokeWidth,
        x: startPos.x,
        y: startPos.y,
        endX: currentPos.x,
        endY: currentPos.y,
      };
      addToHistory([...annotations, newAnnotation]);
    } else if (currentTool === 'rectangle') {
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: 'rectangle',
        color,
        strokeWidth,
        x: Math.min(startPos.x, currentPos.x),
        y: Math.min(startPos.y, currentPos.y),
        width: Math.abs(currentPos.x - startPos.x),
        height: Math.abs(currentPos.y - startPos.y),
        fill: false,
      };
      addToHistory([...annotations, newAnnotation]);
    } else if (currentTool === 'crop') {
      setCropRegion({
        x: Math.min(startPos.x, currentPos.x),
        y: Math.min(startPos.y, currentPos.y),
        width: Math.abs(currentPos.x - startPos.x),
        height: Math.abs(currentPos.y - startPos.y),
      });
    }

    setIsDrawing(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  const handleTextChange = (id: string, text: string) => {
    const newAnnotations = annotations.map((ann) =>
      ann.id === id ? { ...ann, text } : ann
    );
    setAnnotations(newAnnotations);
  };

  const handleTextBlur = () => {
    if (editingTextId) {
      const annotation = annotations.find((a) => a.id === editingTextId);
      if (annotation && !annotation.text) {
        // Remove empty text annotations
        addToHistory(annotations.filter((a) => a.id !== editingTextId));
      } else {
        addToHistory(annotations);
      }
      setEditingTextId(null);
    }
  };

  const handleCropConfirm = async () => {
    if (!cropRegion) return;
    
    // Create a temporary canvas to crop the image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !imageRef.current) return;

    canvas.width = cropRegion.width;
    canvas.height = cropRegion.height;

    // Draw the cropped portion
    ctx.drawImage(
      imageRef.current,
      cropRegion.x,
      cropRegion.y,
      cropRegion.width,
      cropRegion.height,
      0,
      0,
      cropRegion.width,
      cropRegion.height
    );

    // Adjust annotations to new coordinate system
    const adjustedAnnotations = annotations.map((ann) => ({
      ...ann,
      x: ann.x - cropRegion.x,
      y: ann.y - cropRegion.y,
      endX: ann.endX !== undefined ? ann.endX - cropRegion.x : undefined,
      endY: ann.endY !== undefined ? ann.endY - cropRegion.y : undefined,
    })).filter((ann) => {
      // Filter out annotations that are outside the crop region
      return ann.x >= 0 && ann.y >= 0 && 
             ann.x < cropRegion.width && ann.y < cropRegion.height;
    });

    // Update state
    setImageDimensions({ width: cropRegion.width, height: cropRegion.height });
    addToHistory(adjustedAnnotations);
    setCropRegion(null);
    setCurrentTool('none');

    // Update the image source with the cropped canvas
    const dataUrl = canvas.toDataURL('image/png');
    if (imageRef.current) {
      // Wait for the new image to load before allowing further edits
      await new Promise<void>((resolve) => {
        if (imageRef.current) {
          imageRef.current.onload = () => resolve();
          imageRef.current.src = dataUrl;
        } else {
          resolve();
        }
      });
    }
  };

  const handleCropCancel = () => {
    setCropRegion(null);
    setCurrentTool('none');
  };

  const handleSave = async () => {
    if (!imageRef.current || !imageLoaded) return;
    
    setIsSaving(true);
    try {
      // Create a canvas to render the final image
      const canvas = document.createElement('canvas');
      canvas.width = imageDimensions.width;
      canvas.height = imageDimensions.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Draw the base image
      ctx.drawImage(imageRef.current, 0, 0);

      // Draw all annotations
      annotations.forEach((ann) => {
        ctx.strokeStyle = ann.color;
        ctx.fillStyle = ann.color;
        ctx.lineWidth = ann.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (ann.type === 'arrow') {
          if (ann.endX !== undefined && ann.endY !== undefined) {
            drawArrow(ctx, ann.x, ann.y, ann.endX, ann.endY, ann.strokeWidth);
          }
        } else if (ann.type === 'rectangle') {
          if (ann.width && ann.height) {
            ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
            if (ann.fill) {
              ctx.globalAlpha = 0.2;
              ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
              ctx.globalAlpha = 1.0;
            }
          }
        } else if (ann.type === 'text' || ann.type === 'number') {
          const fontSize = ann.type === 'number' ? 48 : 32;
          ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
          ctx.textBaseline = 'top';
          
          if (ann.type === 'number') {
            // Draw numbered badge
            const text = ann.text || '1';
            const metrics = ctx.measureText(text);
            const padding = 12;
            const badgeWidth = metrics.width + padding * 2;
            const badgeHeight = fontSize + padding * 2;
            
            // Draw circle background
            ctx.fillStyle = ann.color;
            ctx.beginPath();
            ctx.arc(
              ann.x + badgeWidth / 2,
              ann.y + badgeHeight / 2,
              Math.max(badgeWidth, badgeHeight) / 2,
              0,
              2 * Math.PI
            );
            ctx.fill();
            
            // Draw text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, ann.x + padding, ann.y + padding);
          } else {
            // Draw text with background
            const text = ann.text || '';
            const metrics = ctx.measureText(text);
            const padding = 8;
            
            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(
              ann.x - padding,
              ann.y - padding,
              metrics.width + padding * 2,
              fontSize + padding * 2
            );
            
            // Draw text
            ctx.fillStyle = ann.color;
            ctx.fillText(text, ann.x, ann.y);
          }
        }
      });

      const dataUrl = canvas.toDataURL('image/png');
      await onSave(dataUrl);
    } catch (error) {
      console.error('Failed to save annotated image:', error);
      alert('Failed to save annotated image');
    } finally {
      setIsSaving(false);
    }
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    strokeWidth: number
  ) => {
    const headLength = Math.max(strokeWidth * 4, 12);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  const renderPreviewShape = () => {
    if (!isDrawing || !startPos || !currentPos) return null;

    if (currentTool === 'arrow') {
      return (
        <line
          x1={startPos.x}
          y1={startPos.y}
          x2={currentPos.x}
          y2={currentPos.y}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd="url(#arrowhead)"
        />
      );
    } else if (currentTool === 'rectangle') {
      return (
        <rect
          x={Math.min(startPos.x, currentPos.x)}
          y={Math.min(startPos.y, currentPos.y)}
          width={Math.abs(currentPos.x - startPos.x)}
          height={Math.abs(currentPos.y - startPos.y)}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
        />
      );
    } else if (currentTool === 'crop') {
      return (
        <rect
          x={Math.min(startPos.x, currentPos.x)}
          y={Math.min(startPos.y, currentPos.y)}
          width={Math.abs(currentPos.x - startPos.x)}
          height={Math.abs(currentPos.y - startPos.y)}
          stroke="#3b82f6"
          strokeWidth={2}
          fill="rgba(59, 130, 246, 0.1)"
          strokeDasharray="5,5"
        />
      );
    }
    return null;
  };

  const resetNumbering = () => {
    setNumberCounter(1);
  };

  return (
    <div className="annotation-editor">
      <div className="annotation-toolbar">
        <div className="toolbar-section">
          <button
            className={`toolbar-button ${currentTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setCurrentTool('arrow')}
            title="Arrow (draw from start to end)"
          >
            <ArrowRight size={18} />
          </button>
          <button
            className={`toolbar-button ${currentTool === 'text' ? 'active' : ''}`}
            onClick={() => setCurrentTool('text')}
            title="Text (click to place)"
          >
            <Type size={18} />
          </button>
          <button
            className={`toolbar-button ${currentTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setCurrentTool('rectangle')}
            title="Rectangle (draw from corner to corner)"
          >
            <Square size={18} />
          </button>
          <button
            className={`toolbar-button ${currentTool === 'crop' ? 'active' : ''}`}
            onClick={() => setCurrentTool('crop')}
            title="Crop (select region to keep)"
          >
            <Crop size={18} />
          </button>
          <button
            className={`toolbar-button ${currentTool === 'number' ? 'active' : ''}`}
            onClick={() => setCurrentTool('number')}
            title="Numbering (click to place numbered badges)"
          >
            <Hash size={18} />
          </button>
          {currentTool === 'number' && (
            <button
              className="toolbar-button"
              onClick={resetNumbering}
              title="Reset counter to 1"
            >
              ↻ {numberCounter}
            </button>
          )}
        </div>

        <div className="toolbar-section">
          <label className="color-picker-label">
            <Circle size={18} style={{ color }} />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-picker"
            />
          </label>
          <select
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="stroke-width-select"
            title="Stroke width"
          >
            <option value={2}>Thin</option>
            <option value={3}>Medium</option>
            <option value={5}>Thick</option>
            <option value={8}>Extra Thick</option>
          </select>
        </div>

        <div className="toolbar-section">
          <button
            className="toolbar-button"
            onClick={handleUndo}
            disabled={historyIndex === 0}
            title="Undo"
          >
            <Undo size={18} />
          </button>
          <button
            className="toolbar-button"
            onClick={handleRedo}
            disabled={historyIndex === history.length - 1}
            title="Redo"
          >
            <Undo size={18} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <button
            className="toolbar-button"
            onClick={handleClearAll}
            disabled={annotations.length === 0}
            title="Clear all annotations"
          >
            <Trash2 size={18} />
          </button>
        </div>

        <div className="toolbar-section toolbar-section-right">
          <button className="toolbar-button" onClick={onCancel} title="Cancel">
            <X size={18} />
          </button>
          <button
            className="toolbar-button toolbar-button-primary"
            onClick={handleSave}
            disabled={isSaving}
            title="Save annotated image"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="annotation-canvas-container">
        <div
          ref={canvasRef}
          className="annotation-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDrawing) handleMouseUp();
          }}
          style={{
            cursor: currentTool !== 'none' ? 'crosshair' : 'default',
          }}
        >
          <img
            ref={imageRef}
            src={convertFileSrc(imagePath)}
            alt="Captured screenshot"
            className="annotation-image"
            onLoad={() => setImageLoaded(true)}
          />

          {imageLoaded && (
            <svg
              className="annotation-svg"
              viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <polygon points="0 0, 10 3, 0 6" fill={color} />
                </marker>
              </defs>

              {annotations.map((ann) => {
                if (ann.type === 'arrow' && ann.endX !== undefined && ann.endY !== undefined) {
                  return (
                    <g key={ann.id}>
                      <line
                        x1={ann.x}
                        y1={ann.y}
                        x2={ann.endX}
                        y2={ann.endY}
                        stroke={ann.color}
                        strokeWidth={ann.strokeWidth}
                        strokeLinecap="round"
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  );
                } else if (ann.type === 'rectangle' && ann.width && ann.height) {
                  return (
                    <rect
                      key={ann.id}
                      x={ann.x}
                      y={ann.y}
                      width={ann.width}
                      height={ann.height}
                      stroke={ann.color}
                      strokeWidth={ann.strokeWidth}
                      fill={ann.fill ? ann.color : 'none'}
                      fillOpacity={ann.fill ? 0.2 : 0}
                    />
                  );
                } else if (ann.type === 'text') {
                  if (editingTextId === ann.id) {
                    return (
                      <foreignObject
                        key={ann.id}
                        x={ann.x}
                        y={ann.y}
                        width="400"
                        height="100"
                      >
                        <input
                          type="text"
                          className="annotation-text-input"
                          value={ann.text || ''}
                          onChange={(e) => handleTextChange(ann.id, e.target.value)}
                          onBlur={handleTextBlur}
                          autoFocus
                          style={{
                            color: ann.color,
                          }}
                        />
                      </foreignObject>
                    );
                  } else {
                    return (
                      <text
                        key={ann.id}
                        x={ann.x}
                        y={ann.y + 24}
                        fill={ann.color}
                        fontSize="32"
                        fontWeight="bold"
                        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      >
                        {ann.text}
                      </text>
                    );
                  }
                } else if (ann.type === 'number') {
                  return (
                    <g key={ann.id}>
                      <circle
                        cx={ann.x + 30}
                        cy={ann.y + 30}
                        r="30"
                        fill={ann.color}
                      />
                      <text
                        x={ann.x + 30}
                        y={ann.y + 30}
                        fill="white"
                        fontSize="40"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                      >
                        {ann.text}
                      </text>
                    </g>
                  );
                }
                return null;
              })}

              {renderPreviewShape()}

              {cropRegion && (
                <rect
                  x={cropRegion.x}
                  y={cropRegion.y}
                  width={cropRegion.width}
                  height={cropRegion.height}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="rgba(59, 130, 246, 0.1)"
                  strokeDasharray="5,5"
                />
              )}
            </svg>
          )}
        </div>

        {cropRegion && (
          <div className="crop-controls">
            <button className="button button-primary" onClick={handleCropConfirm}>
              Confirm Crop
            </button>
            <button className="button button-secondary" onClick={handleCropCancel}>
              Cancel Crop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
