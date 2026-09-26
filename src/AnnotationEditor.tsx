import { useState, useRef, useEffect } from 'react';
import {
  Undo,
  Redo,
  Save,
  X,
  ArrowRight,
  Type,
  Square,
  Crop as CropIcon,
  Hash,
  Palette,
  RotateCcw,
} from 'lucide-react';
import type {
  Annotation,
  ArrowAnnotation,
  TextAnnotation,
  RectangleAnnotation,
  NumberAnnotation,
  CropArea,
} from './types';
import './AnnotationEditor.css';

type Tool = 'arrow' | 'text' | 'rectangle' | 'crop' | 'number' | 'select';

interface AnnotationEditorProps {
  imagePath: string;
  onSave: (imagePath: string) => void;
  onCancel: () => void;
}

export function AnnotationEditor({ imagePath, onSave, onCancel }: AnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [color, setColor] = useState('#3b82f6');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [numberCounter, setNumberCounter] = useState(1);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [tempAnnotation, setTempAnnotation] = useState<Annotation | null>(null);
  const [editingText, setEditingText] = useState<{ id: string; text: string } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = new Image();
    img.src = `file://${imagePath}`;
    img.onload = () => {
      setImage(img);
      const maxWidth = window.innerWidth - 400;
      const maxHeight = window.innerHeight - 200;
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const width = img.width * scale;
      const height = img.height * scale;
      setDimensions({ width, height });
    };
  }, [imagePath]);

  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
      }
    }
  }, [image, dimensions]);

  const addToHistory = (newAnnotations: Annotation[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setAnnotations(newAnnotations);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAnnotations(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAnnotations(history[historyIndex + 1]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select') return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'number') {
      const newAnnotation: NumberAnnotation = {
        id: `number-${Date.now()}`,
        type: 'number',
        color,
        x,
        y,
        number: numberCounter,
      };
      addToHistory([...annotations, newAnnotation]);
      setNumberCounter(numberCounter + 1);
      return;
    }

    if (activeTool === 'text') {
      const newAnnotation: TextAnnotation = {
        id: `text-${Date.now()}`,
        type: 'text',
        color,
        x,
        y,
        text: '',
        fontSize: 16,
      };
      addToHistory([...annotations, newAnnotation]);
      setEditingText({ id: newAnnotation.id, text: '' });
      return;
    }

    setIsDrawing(true);
    setDrawStart({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !drawStart) return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'arrow') {
      const temp: ArrowAnnotation = {
        id: 'temp',
        type: 'arrow',
        color,
        startX: drawStart.x,
        startY: drawStart.y,
        endX: x,
        endY: y,
        strokeWidth,
      };
      setTempAnnotation(temp);
    } else if (activeTool === 'rectangle') {
      const temp: RectangleAnnotation = {
        id: 'temp',
        type: 'rectangle',
        color,
        x: Math.min(drawStart.x, x),
        y: Math.min(drawStart.y, y),
        width: Math.abs(x - drawStart.x),
        height: Math.abs(y - drawStart.y),
        strokeWidth,
        filled: false,
      };
      setTempAnnotation(temp);
    } else if (activeTool === 'crop') {
      setCropArea({
        x: Math.min(drawStart.x, x),
        y: Math.min(drawStart.y, y),
        width: Math.abs(x - drawStart.x),
        height: Math.abs(y - drawStart.y),
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !tempAnnotation) {
      setIsDrawing(false);
      return;
    }

    const finalAnnotation: Annotation = {
      ...tempAnnotation,
      id: `${tempAnnotation.type}-${Date.now()}`,
    };

    addToHistory([...annotations, finalAnnotation]);
    setIsDrawing(false);
    setDrawStart(null);
    setTempAnnotation(null);
  };

  const handleCropConfirm = async () => {
    if (!cropArea || !image) return;

    const scaleX = image.width / dimensions.width;
    const scaleY = image.height / dimensions.height;

    const cropX = Math.round(cropArea.x * scaleX);
    const cropY = Math.round(cropArea.y * scaleY);
    const cropW = Math.round(cropArea.width * scaleX);
    const cropH = Math.round(cropArea.height * scaleY);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const croppedDataUrl = tempCanvas.toDataURL('image/png');
    const newImage = new Image();
    newImage.src = croppedDataUrl;
    newImage.onload = () => {
      setImage(newImage);
      setAnnotations([]);
      setHistory([[]]);
      setHistoryIndex(0);
      setCropArea(null);
      setActiveTool('select');

      const scale = Math.min(
        (window.innerWidth - 400) / newImage.width,
        (window.innerHeight - 200) / newImage.height,
        1
      );
      setDimensions({ width: newImage.width * scale, height: newImage.height * scale });
    };
  };

  const handleSave = async () => {
    if (!image || !canvasRef.current) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = image.width;
    exportCanvas.height = image.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image, 0, 0);

    const scaleX = image.width / dimensions.width;
    const scaleY = image.height / dimensions.height;

    annotations.forEach((annotation) => {
      ctx.strokeStyle = annotation.color;
      ctx.fillStyle = annotation.color;

      if (annotation.type === 'arrow') {
        const arrow = annotation as ArrowAnnotation;
        const sx = arrow.startX * scaleX;
        const sy = arrow.startY * scaleY;
        const ex = arrow.endX * scaleX;
        const ey = arrow.endY * scaleY;

        ctx.lineWidth = arrow.strokeWidth * Math.min(scaleX, scaleY);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        const angle = Math.atan2(ey - sy, ex - sx);
        const headLength = 20 * Math.min(scaleX, scaleY);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLength * Math.cos(angle - Math.PI / 6),
          ey - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLength * Math.cos(angle + Math.PI / 6),
          ey - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      } else if (annotation.type === 'text') {
        const text = annotation as TextAnnotation;
        const x = text.x * scaleX;
        const y = text.y * scaleY;
        const fontSize = text.fontSize * Math.min(scaleX, scaleY);

        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText(text.text, x, y);
      } else if (annotation.type === 'rectangle') {
        const rect = annotation as RectangleAnnotation;
        const x = rect.x * scaleX;
        const y = rect.y * scaleY;
        const w = rect.width * scaleX;
        const h = rect.height * scaleY;

        ctx.lineWidth = rect.strokeWidth * Math.min(scaleX, scaleY);
        ctx.strokeRect(x, y, w, h);
        if (rect.filled) {
          ctx.fillStyle = annotation.color + '33';
          ctx.fillRect(x, y, w, h);
        }
      } else if (annotation.type === 'number') {
        const num = annotation as NumberAnnotation;
        const x = num.x * scaleX;
        const y = num.y * scaleY;
        const radius = 20 * Math.min(scaleX, scaleY);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${radius * 1.2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(num.number.toString(), x, y);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    });

    const dataUrl = exportCanvas.toDataURL('image/png');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const newPath = await invoke<string>('save_annotated_image', {
        originalPath: imagePath,
        imageData: dataUrl,
      });
      onSave(newPath);
    } catch (error) {
      console.error('Failed to save annotated image:', error);
    }
  };

  const clearAnnotations = () => {
    addToHistory([]);
  };

  const resetNumbering = () => {
    setNumberCounter(1);
  };

  const renderAnnotation = (annotation: Annotation, isTemp = false) => {
    const opacity = isTemp ? 0.7 : 1;

    if (annotation.type === 'arrow') {
      const arrow = annotation as ArrowAnnotation;
      const angle = Math.atan2(arrow.endY - arrow.startY, arrow.endX - arrow.startX);
      const headLength = 15;

      return (
        <g key={annotation.id} opacity={opacity}>
          <line
            x1={arrow.startX}
            y1={arrow.startY}
            x2={arrow.endX}
            y2={arrow.endY}
            stroke={arrow.color}
            strokeWidth={arrow.strokeWidth}
            strokeLinecap="round"
          />
          <polygon
            points={`${arrow.endX},${arrow.endY} ${
              arrow.endX - headLength * Math.cos(angle - Math.PI / 6)
            },${arrow.endY - headLength * Math.sin(angle - Math.PI / 6)} ${
              arrow.endX - headLength * Math.cos(angle + Math.PI / 6)
            },${arrow.endY - headLength * Math.sin(angle + Math.PI / 6)}`}
            fill={arrow.color}
          />
        </g>
      );
    }

    if (annotation.type === 'text') {
      const text = annotation as TextAnnotation;
      const isEditing = editingText?.id === annotation.id;

      return (
        <g key={annotation.id} opacity={opacity}>
          {isEditing ? (
            <foreignObject x={text.x} y={text.y - 20} width="300" height="100">
              <input
                autoFocus
                type="text"
                value={editingText.text}
                onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
                onBlur={() => {
                  const updated = annotations.map((a) =>
                    a.id === annotation.id ? { ...a, text: editingText.text } : a
                  );
                  addToHistory(updated);
                  setEditingText(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const updated = annotations.map((a) =>
                      a.id === annotation.id ? { ...a, text: editingText.text } : a
                    );
                    addToHistory(updated);
                    setEditingText(null);
                  }
                }}
                style={{
                  background: 'transparent',
                  border: `2px solid ${text.color}`,
                  color: text.color,
                  fontSize: `${text.fontSize}px`,
                  padding: '4px',
                  outline: 'none',
                }}
              />
            </foreignObject>
          ) : (
            <text
              x={text.x}
              y={text.y}
              fill={text.color}
              fontSize={text.fontSize}
              onDoubleClick={() => setEditingText({ id: text.id, text: text.text })}
              style={{ cursor: 'pointer' }}
            >
              {text.text || '(empty)'}
            </text>
          )}
        </g>
      );
    }

    if (annotation.type === 'rectangle') {
      const rect = annotation as RectangleAnnotation;
      return (
        <g key={annotation.id} opacity={opacity}>
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={rect.filled ? rect.color : 'none'}
            fillOpacity={rect.filled ? 0.2 : 0}
            stroke={rect.color}
            strokeWidth={rect.strokeWidth}
          />
        </g>
      );
    }

    if (annotation.type === 'number') {
      const num = annotation as NumberAnnotation;
      return (
        <g key={annotation.id} opacity={opacity}>
          <circle cx={num.x} cy={num.y} r="20" fill={num.color} />
          <text
            x={num.x}
            y={num.y}
            fill="white"
            fontSize="20"
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {num.number}
          </text>
        </g>
      );
    }

    return null;
  };

  return (
    <div className="annotation-editor">
      <div className="annotation-toolbar">
        <div className="toolbar-section">
          <h2>Annotate</h2>
        </div>

        <div className="toolbar-section">
          <button
            className={`tool-button ${activeTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setActiveTool('arrow')}
            title="Arrow"
          >
            <ArrowRight size={20} />
          </button>
          <button
            className={`tool-button ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool('text')}
            title="Text"
          >
            <Type size={20} />
          </button>
          <button
            className={`tool-button ${activeTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setActiveTool('rectangle')}
            title="Rectangle"
          >
            <Square size={20} />
          </button>
          <button
            className={`tool-button ${activeTool === 'crop' ? 'active' : ''}`}
            onClick={() => setActiveTool('crop')}
            title="Crop"
          >
            <CropIcon size={20} />
          </button>
          <button
            className={`tool-button ${activeTool === 'number' ? 'active' : ''}`}
            onClick={() => setActiveTool('number')}
            title="Numbering"
          >
            <Hash size={20} />
          </button>
        </div>

        <div className="toolbar-section">
          <div className="color-picker-wrapper">
            <Palette size={18} />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="color-picker"
              title="Color"
            />
          </div>
          <label className="stroke-width-label">
            Width
            <input
              type="range"
              min="1"
              max="10"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="stroke-width-slider"
            />
          </label>
        </div>

        <div className="toolbar-section">
          <button
            className="tool-button"
            onClick={undo}
            disabled={historyIndex === 0}
            title="Undo"
          >
            <Undo size={20} />
          </button>
          <button
            className="tool-button"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo"
          >
            <Redo size={20} />
          </button>
          <button className="tool-button" onClick={clearAnnotations} title="Clear All">
            <RotateCcw size={20} />
          </button>
          {activeTool === 'number' && (
            <button className="tool-button" onClick={resetNumbering} title="Reset Numbering">
              Reset #{numberCounter}
            </button>
          )}
        </div>

        <div className="toolbar-section">
          <button className="tool-button success-button" onClick={handleSave} title="Save">
            <Save size={20} />
            Save
          </button>
          <button className="tool-button" onClick={onCancel} title="Cancel">
            <X size={20} />
            Cancel
          </button>
        </div>
      </div>

      <div className="annotation-canvas-wrapper">
        <canvas ref={canvasRef} className="annotation-canvas" />
        <svg
          ref={overlayRef}
          className="annotation-overlay"
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
        >
          {annotations.map((annotation) => renderAnnotation(annotation))}
          {tempAnnotation && renderAnnotation(tempAnnotation, true)}
          {cropArea && (
            <g>
              <rect
                x={0}
                y={0}
                width={dimensions.width}
                height={dimensions.height}
                fill="black"
                opacity={0.5}
              />
              <rect
                x={cropArea.x}
                y={cropArea.y}
                width={cropArea.width}
                height={cropArea.height}
                fill="transparent"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5,5"
              />
              <rect
                x={cropArea.x}
                y={cropArea.y}
                width={cropArea.width}
                height={cropArea.height}
                fill="white"
                opacity={0}
              />
            </g>
          )}
        </svg>

        {cropArea && (
          <div className="crop-controls">
            <button className="button button-primary" onClick={handleCropConfirm}>
              Confirm Crop
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setCropArea(null);
                setActiveTool('select');
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
