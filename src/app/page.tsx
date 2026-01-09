'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';

interface TimeSlot {
  von: string;
  bis: string;
}

interface DayEntry {
  slots: TimeSlot[];
  remark: string;
}

interface PersonalInfo {
  name: string;
  vorname: string;
  gebdat: string;
  persnr: string;
  jahr: string;
  monat: string;
}

interface CellPosition {
  day: number;
  col: number;
}

const MONTHS = [
  { value: '1', label: 'Januar' },
  { value: '2', label: 'Februar' },
  { value: '3', label: 'März' },
  { value: '4', label: 'April' },
  { value: '5', label: 'Mai' },
  { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
];

function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  if (!timeStr || !timeStr.trim()) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hours: h, minutes: m };
    }
  }
  return null;
}

function calculateMinutes(von: string, bis: string): number {
  const start = parseTime(von);
  const end = parseTime(bis);
  if (!start || !end) return 0;
  
  const startMin = start.hours * 60 + start.minutes;
  const endMin = end.hours * 60 + end.minutes;
  
  if (endMin >= startMin) {
    return endMin - startMin;
  } else {
    return (24 * 60 - startMin) + endMin;
  }
}

function createEmptyDayEntries(): DayEntry[] {
  return Array.from({ length: 31 }, () => ({
    slots: [
      { von: '', bis: '' },
      { von: '', bis: '' },
      { von: '', bis: '' },
    ],
    remark: '',
  }));
}

function getCellValue(dayEntries: DayEntry[], day: number, col: number): string {
  if (col < 0 || col > 5) return '';
  const slotIndex = Math.floor(col / 2);
  const field = col % 2 === 0 ? 'von' : 'bis';
  return dayEntries[day - 1].slots[slotIndex][field];
}

const STORAGE_KEY = 'stundenrapport_templates';

interface Template {
  name: string;
  personalInfo: PersonalInfo;
  savedAt: string;
}

function getTemplates(): Template[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: Template[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export default function Home() {
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    name: '',
    vorname: '',
    gebdat: '',
    persnr: '',
    jahr: new Date().getFullYear().toString(),
    monat: (new Date().getMonth() + 1).toString(),
  });
  
  const [dayEntries, setDayEntries] = useState<DayEntry[]>(createEmptyDayEntries());
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('Ready - Drag to select cells, then Ctrl+C/Cmd+C to copy');
  
  // Selection state
  const [selectionStart, setSelectionStart] = useState<CellPosition | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellPosition | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  // Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Load templates from localStorage on mount
  useEffect(() => {
    setTemplates(getTemplates());
  }, []);

  const calculateDayMinutes = useCallback((day: number): number => {
    const entry = dayEntries[day - 1];
    return entry.slots.reduce((total, slot) => {
      return total + calculateMinutes(slot.von, slot.bis);
    }, 0);
  }, [dayEntries]);

  const totalMinutes = dayEntries.reduce((total, _, index) => {
    return total + calculateDayMinutes(index + 1);
  }, 0);

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  // Check if a cell is selected
  const isCellSelected = useCallback((day: number, col: number): boolean => {
    if (!selectionStart || !selectionEnd) return false;
    const minDay = Math.min(selectionStart.day, selectionEnd.day);
    const maxDay = Math.max(selectionStart.day, selectionEnd.day);
    const minCol = Math.min(selectionStart.col, selectionEnd.col);
    const maxCol = Math.max(selectionStart.col, selectionEnd.col);
    return day >= minDay && day <= maxDay && col >= minCol && col <= maxCol;
  }, [selectionStart, selectionEnd]);

  // Get selected range
  const getSelectedRange = useCallback(() => {
    if (!selectionStart || !selectionEnd) return null;
    return {
      minDay: Math.min(selectionStart.day, selectionEnd.day),
      maxDay: Math.max(selectionStart.day, selectionEnd.day),
      minCol: Math.min(selectionStart.col, selectionEnd.col),
      maxCol: Math.max(selectionStart.col, selectionEnd.col),
    };
  }, [selectionStart, selectionEnd]);

  const updateTimeSlot = (day: number, slotIndex: number, field: 'von' | 'bis', value: string) => {
    setDayEntries(prev => {
      const newEntries = [...prev];
      newEntries[day - 1] = {
        ...newEntries[day - 1],
        slots: newEntries[day - 1].slots.map((slot, i) => 
          i === slotIndex ? { ...slot, [field]: value } : slot
        ),
      };
      return newEntries;
    });
  };

  const updateRemark = (day: number, value: string) => {
    setDayEntries(prev => {
      const newEntries = [...prev];
      newEntries[day - 1] = { ...newEntries[day - 1], remark: value };
      return newEntries;
    });
  };

  // Handle cell mouse down - start selection
  const handleCellMouseDown = (day: number, col: number, e: React.MouseEvent) => {
    // Only start selection on left click
    if (e.button !== 0) return;
    
    setSelectionStart({ day, col });
    setSelectionEnd({ day, col });
    setIsSelecting(true);
  };

  // Handle cell mouse enter during selection
  const handleCellMouseEnter = (day: number, col: number) => {
    if (isSelecting) {
      setSelectionEnd({ day, col });
    }
  };

  // Handle mouse up - end selection
  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
    };
    
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Handle keyboard copy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Copy: Ctrl+C or Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const range = getSelectedRange();
        if (range) {
          e.preventDefault();
          
          // Build tab-separated text
          const rows: string[] = [];
          for (let day = range.minDay; day <= range.maxDay; day++) {
            const cols: string[] = [];
            for (let col = range.minCol; col <= range.maxCol; col++) {
              cols.push(getCellValue(dayEntries, day, col));
            }
            rows.push(cols.join('\t'));
          }
          const text = rows.join('\n');
          
          navigator.clipboard.writeText(text).then(() => {
            const cellCount = (range.maxDay - range.minDay + 1) * (range.maxCol - range.minCol + 1);
            setStatus(`Copied ${cellCount} cell(s) to clipboard`);
          });
        }
      }
      
      // Paste: Ctrl+V or Cmd+V (handled by input onPaste)
      
      // Clear selection on Escape
      if (e.key === 'Escape') {
        setSelectionStart(null);
        setSelectionEnd(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dayEntries, getSelectedRange]);

  // Handle paste from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, day: number, col: number) => {
    const pastedText = e.clipboardData.getData('text');
    
    if (pastedText.includes('\t') || pastedText.includes('\n')) {
      e.preventDefault();
      
      const rows = pastedText.trim().split(/\r?\n/);
      
      setDayEntries(prev => {
        const newEntries = [...prev];
        
        rows.forEach((row, rowOffset) => {
          const targetDay = day + rowOffset;
          if (targetDay > 31) return;
          
          const cells = row.split('\t');
          cells.forEach((cellValue, cellOffset) => {
            const targetCol = col + cellOffset;
            if (targetCol > 5) return;
            
            const slotIndex = Math.floor(targetCol / 2);
            const field = targetCol % 2 === 0 ? 'von' : 'bis';
            const value = cellValue.trim();
            
            newEntries[targetDay - 1] = {
              ...newEntries[targetDay - 1],
              slots: newEntries[targetDay - 1].slots.map((slot, i) =>
                i === slotIndex ? { ...slot, [field]: value } : slot
              ),
            };
          });
        });
        
        return newEntries;
      });
      
      setStatus(`Pasted ${rows.length} row(s) from clipboard`);
    }
  };

  // Handle keyboard navigation in input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, day: number, col: number) => {
    const getInputRef = (d: number, c: number) => `input-${d}-${c}`;
    
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (day < 31) {
        const ref = inputRefs.current[getInputRef(day + 1, col)];
        ref?.focus();
        ref?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (day > 1) {
        const ref = inputRefs.current[getInputRef(day - 1, col)];
        ref?.focus();
        ref?.select();
      }
    } else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      if (col < 5) {
        const ref = inputRefs.current[getInputRef(day, col + 1)];
        ref?.focus();
        ref?.select();
      }
    } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      if (col > 0) {
        const ref = inputRefs.current[getInputRef(day, col - 1)];
        ref?.focus();
        ref?.select();
      }
    }
  };

  const clearAll = () => {
    if (confirm('Clear all entries?')) {
      setDayEntries(createEmptyDayEntries());
      setSelectionStart(null);
      setSelectionEnd(null);
      setStatus('Cleared');
    }
  };

  // Clear selection when clicking outside
  const clearSelection = () => {
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  // Template functions
  const saveTemplate = () => {
    if (!templateName.trim()) {
      setStatus('Please enter a template name');
      return;
    }
    
    const newTemplate: Template = {
      name: templateName.trim(),
      personalInfo: { ...personalInfo },
      savedAt: new Date().toISOString(),
    };
    
    // Check if template with same name exists
    const existingIndex = templates.findIndex(t => t.name === newTemplate.name);
    let updatedTemplates: Template[];
    
    if (existingIndex >= 0) {
      updatedTemplates = [...templates];
      updatedTemplates[existingIndex] = newTemplate;
    } else {
      updatedTemplates = [...templates, newTemplate];
    }
    
    saveTemplates(updatedTemplates);
    setTemplates(updatedTemplates);
    setTemplateName('');
    setShowTemplateModal(false);
    setStatus(`Template "${newTemplate.name}" saved`);
  };

  const loadTemplate = (template: Template) => {
    setPersonalInfo({
      ...template.personalInfo,
      jahr: new Date().getFullYear().toString(),
      monat: (new Date().getMonth() + 1).toString(),
    });
    setShowTemplateModal(false);
    setStatus(`Template "${template.name}" loaded`);
  };

  const deleteTemplate = (name: string) => {
    if (confirm(`Delete template "${name}"?`)) {
      const updatedTemplates = templates.filter(t => t.name !== name);
      saveTemplates(updatedTemplates);
      setTemplates(updatedTemplates);
      setStatus(`Template "${name}" deleted`);
    }
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    setStatus('Generating PDF...');

    try {
      const response = await fetch('/Stundenrapport.pdf');
      const pdfBytes = await response.arrayBuffer();
      
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();

      const setTextField = (name: string, value: string) => {
        try {
          const field = form.getTextField(name);
          field.setText(value);
        } catch {
          // Field not found, skip
        }
      };

      setTextField('allg.name', personalInfo.name);
      setTextField('allg.vorname', personalInfo.vorname);
      setTextField('allg.gebdat', personalInfo.gebdat);
      setTextField('allg.persnr', personalInfo.persnr);
      setTextField('allg.jahr', personalInfo.jahr);

      try {
        const monatField = form.getDropdown('allg.monat');
        const monthLabel = MONTHS.find(m => m.value === personalInfo.monat)?.label || '';
        const options = monatField.getOptions();
        const matchingOption = options.find(opt => opt.includes(monthLabel));
        if (matchingOption) {
          monatField.select(matchingOption);
        }
      } catch {
        // Dropdown not found
      }

      for (let day = 1; day <= 31; day++) {
        const entry = dayEntries[day - 1];
        
        for (let slot = 0; slot < 3; slot++) {
          const { von, bis } = entry.slots[slot];
          if (von) setTextField(`tab.ein_${slot + 1}.${day}`, von);
          if (bis) setTextField(`tab.aus_${slot + 1}.${day}`, bis);
        }

        const dayMinutes = calculateDayMinutes(day);
        if (dayMinutes > 0) {
          setTextField(`tab.totall_dd.${day}`, dayMinutes.toString());
        }

        if (entry.remark) {
          setTextField(`tab.bemerkung.${day}`, entry.remark);
        }
      }

      setTextField('tab.totall_mm', totalMinutes.toString());
      setTextField('totall_dez', totalHours.toString());

      const fields = form.getFields();
      for (const field of fields) {
        const name = field.getName();
        if (name === 'allg.datum.ma' || name === 'allg.datum.vg') {
          continue;
        }
        field.enableReadOnly();
      }

      const modifiedPdfBytes = await pdfDoc.save();
      
      // Create a new Uint8Array to ensure compatibility with Blob constructor
      const blob = new Blob([new Uint8Array(modifiedPdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Stundenrapport_${personalInfo.jahr}_${personalInfo.monat}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus(`PDF generated: ${totalMinutes} minutes, ${totalHours} hours`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setStatus('Error generating PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white select-none">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Stundenrapport
          </h1>
          <p className="text-center text-slate-400 mt-2">Working Hours Entry System</p>
        </header>

        {/* Personal Information */}
        <section className="bg-slate-800/50 backdrop-blur rounded-xl p-6 mb-6 border border-slate-700" onClick={clearSelection}>
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Personal Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={personalInfo.name}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 select-text"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Vorname</label>
              <input
                type="text"
                value={personalInfo.vorname}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, vorname: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 select-text"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Geburtsdatum</label>
              <input
                type="text"
                placeholder="DD.MM.YYYY"
                value={personalInfo.gebdat}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, gebdat: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 select-text"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Personalnr</label>
              <input
                type="text"
                value={personalInfo.persnr}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, persnr: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 select-text"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Jahr</label>
              <input
                type="text"
                value={personalInfo.jahr}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, jahr: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 select-text"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Monat</label>
              <select
                value={personalInfo.monat}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, monat: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.value} - {m.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-4 italic">
            Note: Signature dates (Datum) can be filled in the PDF after generation using Mac Preview.
          </p>
        </section>

        {/* Time Entries */}
        <section className="bg-slate-800/50 backdrop-blur rounded-xl p-6 mb-6 border border-slate-700">
          <h2 className="text-lg font-semibold mb-2 text-cyan-400">Working Hours (HH:MM format)</h2>
          <p className="text-sm text-slate-500 mb-4">
            💡 Drag to select cells → Ctrl+C/Cmd+C to copy → Click target cell → Ctrl+V/Cmd+V to paste
          </p>
          
          {/* Header */}
          <div className="grid grid-cols-[50px_repeat(6,1fr)_80px_1fr] gap-2 mb-2 text-sm font-medium text-slate-400 sticky top-0 bg-slate-800/90 py-2 z-10">
            <div className="text-center">Tag</div>
            <div className="text-center">von</div>
            <div className="text-center">bis</div>
            <div className="text-center">von</div>
            <div className="text-center">bis</div>
            <div className="text-center">von</div>
            <div className="text-center">bis</div>
            <div className="text-center">Min.</div>
            <div>Bemerkung</div>
          </div>

          {/* Day rows */}
          <div className="max-h-[400px] overflow-y-auto">
            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
              const dayMinutes = calculateDayMinutes(day);
              return (
                <div 
                  key={day} 
                  className={`grid grid-cols-[50px_repeat(6,1fr)_80px_1fr] gap-2 py-1 ${
                    day % 2 === 0 ? 'bg-slate-700/30' : ''
                  }`}
                >
                  <div className="text-center font-medium text-slate-300">{day}</div>
                  {[0, 1, 2].map(slotIndex => (
                    <div key={`${day}-slot-${slotIndex}`} className="contents">
                      {/* von */}
                      <div
                        onMouseDown={(e) => handleCellMouseDown(day, slotIndex * 2, e)}
                        onMouseEnter={() => handleCellMouseEnter(day, slotIndex * 2)}
                        className={`relative ${isCellSelected(day, slotIndex * 2) ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900 rounded' : ''}`}
                      >
                        <input
                          ref={(el) => { inputRefs.current[`input-${day}-${slotIndex * 2}`] = el; }}
                          type="text"
                          placeholder="HH:MM"
                          value={dayEntries[day - 1].slots[slotIndex].von}
                          onChange={(e) => updateTimeSlot(day, slotIndex, 'von', e.target.value)}
                          onPaste={(e) => handlePaste(e, day, slotIndex * 2)}
                          onKeyDown={(e) => handleKeyDown(e, day, slotIndex * 2)}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-cyan-500 select-text"
                        />
                      </div>
                      {/* bis */}
                      <div
                        onMouseDown={(e) => handleCellMouseDown(day, slotIndex * 2 + 1, e)}
                        onMouseEnter={() => handleCellMouseEnter(day, slotIndex * 2 + 1)}
                        className={`relative ${isCellSelected(day, slotIndex * 2 + 1) ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900 rounded' : ''}`}
                      >
                        <input
                          ref={(el) => { inputRefs.current[`input-${day}-${slotIndex * 2 + 1}`] = el; }}
                          type="text"
                          placeholder="HH:MM"
                          value={dayEntries[day - 1].slots[slotIndex].bis}
                          onChange={(e) => updateTimeSlot(day, slotIndex, 'bis', e.target.value)}
                          onPaste={(e) => handlePaste(e, day, slotIndex * 2 + 1)}
                          onKeyDown={(e) => handleKeyDown(e, day, slotIndex * 2 + 1)}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-cyan-500 select-text"
                        />
                      </div>
                    </div>
                  ))}
                  <div className={`text-center font-mono ${dayMinutes > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                    {dayMinutes > 0 ? dayMinutes : ''}
                  </div>
                  <input
                    type="text"
                    value={dayEntries[day - 1].remark}
                    onChange={(e) => updateRemark(day, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-cyan-500 select-text"
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Summary */}
        <section className="bg-slate-800/50 backdrop-blur rounded-xl p-6 mb-6 border border-slate-700" onClick={clearSelection}>
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-slate-400 text-sm mb-1">Total Stunden (Minutes)</div>
              <div className="text-3xl font-bold text-blue-400">{totalMinutes}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-sm mb-1">Hours:Minutes</div>
              <div className="text-3xl font-bold text-blue-400">{totalHours}:{remainingMinutes.toString().padStart(2, '0')}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400 text-sm mb-1">Stunden Dezimal (Hours, floor)</div>
              <div className="text-3xl font-bold text-green-400">{totalHours}</div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="flex flex-wrap gap-4 justify-center">
          <button
            onClick={generatePDF}
            disabled={isGenerating}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/25"
          >
            {isGenerating ? 'Generating...' : 'Generate PDF'}
          </button>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-lg font-semibold transition-all shadow-lg shadow-emerald-500/25"
          >
            Templates
          </button>
          <button
            onClick={clearAll}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-all border border-slate-600"
          >
            Clear All
          </button>
        </section>

        {/* Status Bar */}
        <footer className="mt-8 text-center text-slate-500 text-sm">
          {status}
        </footer>

        {/* Template Modal */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowTemplateModal(false)}>
            <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 border border-slate-600 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Templates</h3>
              
              {/* Save new template */}
              <div className="mb-6">
                <label className="block text-sm text-slate-400 mb-2">Save Current Info as Template</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name..."
                    className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={saveTemplate}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded font-medium transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
              
              {/* Saved templates list */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Saved Templates</label>
                {templates.length === 0 ? (
                  <p className="text-slate-500 text-sm italic">No templates saved yet</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {templates.map((template) => (
                      <div
                        key={template.name}
                        className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3 border border-slate-600"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{template.name}</div>
                          <div className="text-xs text-slate-400">
                            {template.personalInfo.name} {template.personalInfo.vorname}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-2">
                          <button
                            onClick={() => loadTemplate(template)}
                            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 rounded text-sm font-medium transition-colors"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => deleteTemplate(template.name)}
                            className="px-3 py-1 bg-red-600/80 hover:bg-red-700 rounded text-sm font-medium transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Close button */}
              <button
                onClick={() => setShowTemplateModal(false)}
                className="mt-6 w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors border border-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
