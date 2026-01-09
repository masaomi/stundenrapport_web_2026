'use client';

import { useState, useCallback, useRef } from 'react';
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
    // Overnight
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

// Convert cell position to day/slot/field
function getCellPosition(day: number, colIndex: number): { day: number; slotIndex: number; field: 'von' | 'bis' } | null {
  // colIndex: 0=von1, 1=bis1, 2=von2, 3=bis2, 4=von3, 5=bis3
  if (colIndex < 0 || colIndex > 5) return null;
  const slotIndex = Math.floor(colIndex / 2);
  const field = colIndex % 2 === 0 ? 'von' : 'bis';
  return { day, slotIndex, field };
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
  const [status, setStatus] = useState('Ready - Paste from Excel supported (Ctrl+V / Cmd+V)');
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

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

  // Handle paste from Excel (tab-separated values)
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, day: number, colIndex: number) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Check if it's multi-cell paste (contains tabs or newlines)
    if (pastedText.includes('\t') || pastedText.includes('\n')) {
      e.preventDefault();
      
      // Parse rows and columns
      const rows = pastedText.trim().split(/\r?\n/);
      
      setDayEntries(prev => {
        const newEntries = [...prev];
        
        rows.forEach((row, rowOffset) => {
          const targetDay = day + rowOffset;
          if (targetDay > 31) return;
          
          const cells = row.split('\t');
          cells.forEach((cellValue, cellOffset) => {
            const targetCol = colIndex + cellOffset;
            const pos = getCellPosition(targetDay, targetCol);
            
            if (pos && pos.day <= 31) {
              const value = cellValue.trim();
              newEntries[pos.day - 1] = {
                ...newEntries[pos.day - 1],
                slots: newEntries[pos.day - 1].slots.map((slot, i) =>
                  i === pos.slotIndex ? { ...slot, [pos.field]: value } : slot
                ),
              };
            }
          });
        });
        
        return newEntries;
      });
      
      setStatus(`Pasted ${rows.length} row(s) from clipboard`);
    }
    // Single cell paste is handled normally by the browser
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, day: number, colIndex: number) => {
    const getInputRef = (d: number, c: number) => `input-${d}-${c}`;
    
    if (e.key === 'Tab') {
      // Default tab behavior
      return;
    }
    
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextDay = day + 1;
      if (nextDay <= 31) {
        const ref = inputRefs.current[getInputRef(nextDay, colIndex)];
        ref?.focus();
        ref?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevDay = day - 1;
      if (prevDay >= 1) {
        const ref = inputRefs.current[getInputRef(prevDay, colIndex)];
        ref?.focus();
        ref?.select();
      }
    } else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      const nextCol = colIndex + 1;
      if (nextCol <= 5) {
        const ref = inputRefs.current[getInputRef(day, nextCol)];
        ref?.focus();
        ref?.select();
      }
    } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      const prevCol = colIndex - 1;
      if (prevCol >= 0) {
        const ref = inputRefs.current[getInputRef(day, prevCol)];
        ref?.focus();
        ref?.select();
      }
    }
  };

  const clearAll = () => {
    if (confirm('Clear all entries?')) {
      setDayEntries(createEmptyDayEntries());
      setStatus('Cleared');
    }
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    setStatus('Generating PDF...');

    try {
      // Fetch the PDF template
      const response = await fetch('/Stundenrapport.pdf');
      const pdfBytes = await response.arrayBuffer();
      
      // Load the PDF
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();

      // Fill personal info
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

      // Set month dropdown
      try {
        const monatField = form.getDropdown('allg.monat');
        const monthLabel = MONTHS.find(m => m.value === personalInfo.monat)?.label || '';
        const options = monatField.getOptions();
        const matchingOption = options.find(opt => opt.includes(monthLabel));
        if (matchingOption) {
          monatField.select(matchingOption);
        }
      } catch {
        // Dropdown not found or error, skip
      }

      // Fill time entries
      for (let day = 1; day <= 31; day++) {
        const entry = dayEntries[day - 1];
        
        for (let slot = 0; slot < 3; slot++) {
          const { von, bis } = entry.slots[slot];
          if (von) setTextField(`tab.ein_${slot + 1}.${day}`, von);
          if (bis) setTextField(`tab.aus_${slot + 1}.${day}`, bis);
        }

        // Daily total
        const dayMinutes = calculateDayMinutes(day);
        if (dayMinutes > 0) {
          setTextField(`tab.totall_dd.${day}`, dayMinutes.toString());
        }

        // Remark
        if (entry.remark) {
          setTextField(`tab.bemerkung.${day}`, entry.remark);
        }
      }

      // Fill totals
      setTextField('tab.totall_mm', totalMinutes.toString());
      setTextField('totall_dez', totalHours.toString());

      // Flatten the form fields EXCEPT signature date fields
      const fields = form.getFields();
      for (const field of fields) {
        const name = field.getName();
        // Keep signature date fields editable
        if (name === 'allg.datum.ma' || name === 'allg.datum.vg') {
          continue;
        }
        field.enableReadOnly();
      }

      // Save the PDF
      const modifiedPdfBytes = await pdfDoc.save();
      
      // Download the PDF - convert to ArrayBuffer for TypeScript compatibility
      const arrayBuffer = modifiedPdfBytes.buffer.slice(
        modifiedPdfBytes.byteOffset,
        modifiedPdfBytes.byteOffset + modifiedPdfBytes.byteLength
      );
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Stundenrapport
          </h1>
          <p className="text-center text-slate-400 mt-2">Working Hours Entry System</p>
        </header>

        {/* Personal Information */}
        <section className="bg-slate-800/50 backdrop-blur rounded-xl p-6 mb-6 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 text-cyan-400">Personal Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={personalInfo.name}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Vorname</label>
              <input
                type="text"
                value={personalInfo.vorname}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, vorname: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Geburtsdatum</label>
              <input
                type="text"
                placeholder="DD.MM.YYYY"
                value={personalInfo.gebdat}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, gebdat: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Personalnr</label>
              <input
                type="text"
                value={personalInfo.persnr}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, persnr: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Jahr</label>
              <input
                type="text"
                value={personalInfo.jahr}
                onChange={(e) => setPersonalInfo(prev => ({ ...prev, jahr: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
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
            💡 Tip: Copy cells from Excel and paste here. Use Arrow keys to navigate.
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
                      <input
                        ref={(el) => { inputRefs.current[`input-${day}-${slotIndex * 2}`] = el; }}
                        type="text"
                        placeholder="HH:MM"
                        value={dayEntries[day - 1].slots[slotIndex].von}
                        onChange={(e) => updateTimeSlot(day, slotIndex, 'von', e.target.value)}
                        onPaste={(e) => handlePaste(e, day, slotIndex * 2)}
                        onKeyDown={(e) => handleKeyDown(e, day, slotIndex * 2)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      />
                      <input
                        ref={(el) => { inputRefs.current[`input-${day}-${slotIndex * 2 + 1}`] = el; }}
                        type="text"
                        placeholder="HH:MM"
                        value={dayEntries[day - 1].slots[slotIndex].bis}
                        onChange={(e) => updateTimeSlot(day, slotIndex, 'bis', e.target.value)}
                        onPaste={(e) => handlePaste(e, day, slotIndex * 2 + 1)}
                        onKeyDown={(e) => handleKeyDown(e, day, slotIndex * 2 + 1)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      />
                    </div>
                  ))}
                  <div className={`text-center font-mono ${dayMinutes > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                    {dayMinutes > 0 ? dayMinutes : ''}
                  </div>
                  <input
                    type="text"
                    value={dayEntries[day - 1].remark}
                    onChange={(e) => updateRemark(day, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Summary */}
        <section className="bg-slate-800/50 backdrop-blur rounded-xl p-6 mb-6 border border-slate-700">
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
        </div>
    </div>
  );
}
