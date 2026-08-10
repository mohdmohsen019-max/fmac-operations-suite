import React, { useState, useEffect } from 'react';
import { 
  X, Upload, FileText, CheckCircle2, AlertTriangle, Loader2, 
  ChevronRight, Save, Trash2, Edit2, Info, Receipt
} from 'lucide-react';
import { db, storage, auth } from '../../firebase';
import { 
  collection, getDocs, addDoc, serverTimestamp, 
  query, where, writeBatch, doc 
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { pdfService } from '../../services/pdfService';
import { statementExcelService } from '../../services/statementExcelService';
import { SectionTitle, FleetTable } from './FleetSharedUI';
import { useLanguage } from '../../contexts/LanguageContext';

/* Accepted statement formats. Decided by extension — Office MIME types are
   inconsistent across browsers and operating systems, extensions are not. */
const STATEMENT_ACCEPT = '.pdf,.xlsx,.xlsm,.xls,.csv';
const isExcelStatement = (f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f?.name || '');
const isPdfStatement = (f) => /\.pdf$/i.test(f?.name || '');
const isSupportedStatement = (f) => isExcelStatement(f) || isPdfStatement(f);

export default function MaintenanceUploadModal({ isOpen, onClose, onImportComplete }) {
  const { t, locale } = useLanguage();
  const [step, setStep] = useState(1); // 1: Upload, 2: Parsing, 3: Preview, 4: Manual/Correction
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [statementPeriod, setStatementPeriod] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(t('Processing...', 'جارٍ المعالجة...'));
  const [rawOcrText, setRawOcrText] = useState('');
  const [showRawOcr, setShowRawOcr] = useState(false);

  async function fetchVehicles() {
    try {
      const snap = await getDocs(collection(db, 'vehicles'));
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching vehicles:', err);
    }
  }

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchVehicles();
      resetState();
    }
  }, [isOpen]);


  const resetState = () => {
    setStep(1);
    setFile(null);
    setUploadProgress(0);
    setParsing(false);
    setRecords([]);
    setError(null);
    setSaving(false);
    setStatusMessage(t('Processing...', 'جارٍ المعالجة...'));
    setRawOcrText('');
    setShowRawOcr(false);
  };

  const handleFileSelect = (e) => {
    acceptFile(e.target.files[0]);
  };

  /* Shared by the picker and the drop zone. Type is decided by extension —
     Office MIME types vary by browser and OS, the extension does not. */
  const acceptFile = (selectedFile) => {
    if (!selectedFile) return;
    if (!isSupportedStatement(selectedFile)) {
      setError(t('Please select a PDF or Excel statement (.pdf, .xlsx, .xls, .csv).',
                 'يرجى تحديد كشف حساب بصيغة PDF أو Excel (.pdf, .xlsx, .xls, .csv).'));
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const [validationResult, setValidationResult] = useState(null);

  const startProcessing = async () => {
    if (!file) return;
    setStep(2);
    setParsing(true);
    setError(null);
    setValidationResult(null);
    
    /* A spreadsheet is parsed directly — the figures are already machine-
       readable, so it is exact and instant. Only a PDF needs the vision pass. */
    const parser = isExcelStatement(file) ? statementExcelService : pdfService;
    const result = await parser.parseStatement(file, (msg) => {
      // Map common status messages to Arabic
      const localizedMsg = {
        'Initializing...': t('Initializing...', 'جارٍ البدء...'),
        'Reading PDF...': t('Reading PDF...', 'قراءة ملف PDF...'),
        'Extracting text...': t('Extracting text...', 'استخراج النص...'),
        'Parsing records...': t('Parsing records...', 'تحليل السجلات...'),
        'Validating data...': t('Validating data...', 'التحقق من البيانات...'),
        'Processing...': t('Processing...', 'جارٍ المعالجة...')
      }[msg] || msg;
      setStatusMessage(localizedMsg);
    });
    
    if (result.success) {
      setValidationResult(result.validation);
      
      // Enhance records with vehicle info
      const enhanced = result.records.map(r => {
        const matchedVehicle = vehicles.find(v => v.plateNumber === String(r.plateNumber));
        return {
          ...r,
          id: Math.random().toString(36).substr(2, 9),
          vehicleId: matchedVehicle ? matchedVehicle.id : null,
          vehicleName: matchedVehicle ? `${t('Bus', 'حافلة')} ${matchedVehicle.busNumber} (${matchedVehicle.plateNumber})` : t('Unknown Vehicle', 'مركبة غير معروفة'),
          selected: true,
          status: matchedVehicle ? 'matched' : 'warning'
        };
      });
      
      setRecords(enhanced);
      setStatementPeriod(result.statementPeriod);
      
      /* Reconciliation. A spreadsheet carries its own TOTAL row, so we compare
         against the statement's stated figures rather than a fixed expectation
         — that reconciles every month, not just one particular statement. */
      const v = result.validation;
      if (!v.isTotalValid && v.statedTotal != null) {
        setError(t(
          `Reconciliation warning: the rows total AED ${v.actualTotal.toFixed(2)} but the statement states AED ${v.statedTotal.toFixed(2)}. Check for a missing or duplicated row.`,
          `تحذير المطابقة: مجموع الصفوف ${v.actualTotal.toFixed(2)} د.إ بينما الكشف يذكر ${v.statedTotal.toFixed(2)} د.إ. تحقق من وجود صف ناقص أو مكرر.`));
      } else if (v.actualCount < 5) {
        setError(t(
          `Only ${v.actualCount} record(s) detected — please verify the statement or add missing rows manually.`,
          `تم اكتشاف ${v.actualCount} سجل فقط — يرجى التحقق من الكشف أو إضافة الصفوف الناقصة يدوياً.`));
      }

      setStep(3);
    } else {
      setError(t(`Analysis failed: ${result.error}`, `فشل التحليل: ${result.error}`));
      setStep(1);
    }
    setParsing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const selectedRecords = records.filter(r => r.selected);
    
    try {
      const batch = writeBatch(db);
      const mainColl = collection(db, 'maintenance');
      const statColl = collection(db, 'monthlyStatements');

      selectedRecords.forEach(r => {
        let saveDate = r.date;
        try {
          if (r.date && r.date.includes('/')) {
            const [d, m, y] = r.date.split('/');
            saveDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
        } catch (e) {
          console.error('Date normalization failed:', e);
        }

        const newDoc = doc(mainColl);
        batch.set(newDoc, {
          date: saveDate,
          invoiceNumber: r.invoiceNumber,
          plateNumber: r.plateNumber,
          vehicleId: r.vehicleId,
          description: r.description,
          amount: parseFloat(r.amount) || 0,
          vat: parseFloat(r.vat) || 0,
          total: parseFloat(r.total) || 0,
          supplier: 'Abu Thahnun Garage',
          statementPeriod: statementPeriod,
          fileUrl: null, // Skipping upload due to CORS
          importedAt: serverTimestamp(),
          importedBy: auth.currentUser?.uid || 'system',
          source: 'AI_IMPORT'
        });
      });

      // Save Summary Statement for history
      const summaryDoc = doc(statColl);
      batch.set(summaryDoc, {
        supplier: 'Abu Thahnun Garage',
        statementPeriod,
        totalAmount: selectedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0),
        totalVAT: selectedRecords.reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0),
        grandTotal: selectedRecords.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0),
        fileUrl: null,
        recordCount: selectedRecords.length,
        importedAt: serverTimestamp(),
        importedBy: auth.currentUser?.uid || 'system'
      });

      await batch.commit();
      onImportComplete(selectedRecords.length);
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
      setError(t('Failed to save records: ', 'فشل حفظ السجلات: ') + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => {
    const newRecord = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString().split('T')[0],
      invoiceNumber: '',
      plateNumber: '',
      vehicleId: null,
      vehicleName: t('New Manual Record', 'سجل يدوي جديد'),
      description: '',
      amount: 0,
      vat: 0,
      total: 0,
      supplier: 'Abu Thahnun Garage',
      statementPeriod: statementPeriod || t('Manual Entry', 'إدخال يدوي'),
      selected: true,
      status: 'warning'
    };
    setRecords([...records, newRecord]);
  };

  const updateRecord = (id, field, value) => {
    setRecords(records.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        // Recalculate total if amount or vat changes
        if (field === 'amount' || field === 'vat') {
          updated.total = (parseFloat(updated.amount) || 0) + (parseFloat(updated.vat) || 0);
        }
        // Re-match vehicle if plate changes
        if (field === 'plateNumber') {
          const matched = vehicles.find(v => v.plateNumber === value);
          updated.vehicleId = matched ? matched.id : null;
          updated.vehicleName = matched ? `${t('Bus', 'حافلة')} ${matched.busNumber} (${matched.plateNumber})` : t('Unknown Vehicle', 'مركبة غير معروفة');
          updated.status = matched ? 'matched' : 'warning';
        }
        return updated;
      }
      return r;
    }));
  };

  const removeRecord = (id) => {
    setRecords(records.filter(r => r.id !== id));
  };

  const toggleRecord = (id) => {
    setRecords(records.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  if (!isOpen) return null;

  return (
    <div className="fleet-modal-overlay">
      <div className="fleet-modal-content" style={{ maxWidth: step === 3 ? '1100px' : '600px' }}>
        <div className="fleet-modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FileText className="text-gold" />
            {step === 1 && t('Upload Garage Statement', 'تحميل كشف حساب المرآب')}
            {step === 2 && t('Processing Statement...', 'معالجة الكشف...')}
            {step === 3 && t('Verify & Import Records', 'التحقق واستيراد السجلات')}
            {step === 4 && t('Manual Entry Fallback', 'بديل الإدخال اليدوي')}
          </h2>
          <button onClick={onClose} className="fleet-btn-icon"><X size={20} /></button>
        </div>

        <div className="fleet-modal-body" style={{ padding: '24px' }}>
          
          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div style={{ textAlign: 'center' }}>
              <div 
                className="upload-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  acceptFile(e.dataTransfer.files[0]);
                }}
                style={{
                  border: '2px dashed var(--theme-accent-border)',
                  borderRadius: '12px',
                  padding: '48px',
                  background: 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  marginBottom: '20px'
                }}
              >
                <input 
                  type="file" 
                  id="pdf-upload" 
                  hidden 
                  accept={STATEMENT_ACCEPT}
                  onChange={handleFileSelect}
                />
                <label htmlFor="pdf-upload" style={{ cursor: 'pointer' }}>
                  <Upload size={48} className="text-gold" style={{ marginBottom: '16px', opacity: 0.6 }} />
                  <p style={{ fontWeight: 700, margin: '0 0 8px' }}>
                    {file ? file.name : t('Drop a PDF or Excel file here, or click to browse', 'ألقِ ملف PDF أو Excel هنا أو انقر للتصفح')}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                    {file && isExcelStatement(file)
                      ? t('Excel — read directly, no scanning needed', 'Excel — تُقرأ مباشرة دون الحاجة للمسح الضوئي')
                      : t('Scanned PDF statements or Excel workbooks from the garage', 'كشوفات PDF الممسوحة ضوئياً أو ملفات Excel من المرآب')}
                  </p>
                </label>
              </div>

              {error && (
                <div style={{ color: '#EF4444', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} /> {error}
                </div>
              )}

              <button 
                className="fleet-btn-primary" 
                disabled={!file}
                onClick={startProcessing}
                style={{ width: '100%', padding: '12px' }}
              >
                {t('Continue to Parsing', 'المتابعة للتحليل')} <ChevronRight size={18} style={{ marginLeft: locale === 'ar-SA' ? '0' : '8px', marginRight: locale === 'ar-SA' ? '8px' : '0', transform: locale === 'ar-SA' ? 'rotate(180deg)' : 'none' }} />
              </button>
            </div>
          )}

          {/* STEP 2: PARSING */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '20px' }}>
              <div className="app-loader"><span /><span /><span /><span /><span /></div>
              <h3 style={{ margin: 0 }}>{t('Extracting Records', 'استخراج السجلات')}</h3>
              <p style={{ color: 'var(--theme-text-muted)', margin: 0 }}>{statusMessage}</p>
            </div>
          )}

          {/* STEP 3: PREVIEW / EDITOR */}
          {step === 3 && (
            <div>
              {error && (
                <div style={{ 
                  background: 'var(--status-warn-bg)', 
                  border: '1px solid var(--status-warn-border)', 
                  padding: '10px 16px', 
                  borderRadius: '8px', 
                  marginBottom: '16px',
                  color: 'var(--status-warn)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={18} />
                  {error}
                </div>
              )}
              <div style={{ 
                background: 'var(--theme-surface-pearl)', 
                border: '1px solid var(--theme-border)', 
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Receipt size={18} className="text-gold" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t('Period:', 'الفترة:')} {statementPeriod}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>{t(`${records.length} records detected. You can edit any field before importing.`, `تم اكتشاف ${records.length} سجل. يمكنك تعديل أي حقل قبل الاستيراد.`)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ textAlign: locale === 'ar-SA' ? 'left' : 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)' }}>{t('VAT TOTAL', 'إجمالي الضريبة')}</div>
                    <div style={{ fontWeight: 800 }}>{t('AED', 'د.إ')} {records.filter(r => r.selected).reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0).toLocaleString(locale)}</div>
                  </div>
                  <div style={{ textAlign: locale === 'ar-SA' ? 'left' : 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                      {t('GRAND TOTAL', 'المجموع الكلي')}
                      {validationResult?.isTotalValid ? (
                        <CheckCircle2 size={12} className="text-green-500" style={{ color: '#10B981' }} />
                      ) : (
                        <AlertTriangle size={12} className="text-amber-500" style={{ color: 'var(--status-warn)' }} />
                      )}
                    </div>
                    <div style={{ fontWeight: 800, color: validationResult?.isTotalValid ? 'var(--status-safe)' : 'var(--theme-accent)' }}>
                      {t('AED', 'د.إ')} {records.filter(r => r.selected).reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0).toLocaleString(locale)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid var(--fleet-border)', borderRadius: '8px' }}>
                <table className="fleet-table editable-table" style={{ margin: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th style={{ width: '120px' }}>{t('Date', 'التاريخ')}</th>
                      <th style={{ width: '120px' }}>{t('Plate', 'اللوحة')}</th>
                      <th>{t('Description', 'الوصف')}</th>
                      <th style={{ width: '110px' }}>{t('Amount', 'المبلغ')}</th>
                      <th style={{ width: '100px' }}>{t('VAT', 'الضريبة')}</th>
                      <th style={{ width: '110px' }}>{t('Total', 'الإجمالي')}</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} className={!r.selected ? 'row-disabled' : ''}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={r.selected} 
                            onChange={() => toggleRecord(r.id)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="preview-input"
                            type="date" 
                            value={r.date} 
                            onChange={(e) => updateRecord(r.id, 'date', e.target.value)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="preview-input mono"
                            placeholder={t('Plate', 'اللوحة')}
                            value={r.plateNumber} 
                            onChange={(e) => updateRecord(r.id, 'plateNumber', e.target.value)} 
                            style={{ color: r.status === 'warning' ? 'var(--status-warn)' : 'var(--theme-accent)', fontWeight: 800 }}
                          />
                        </td>
                        <td>
                          <input 
                            className="preview-input"
                            placeholder={t('Service Description', 'وصف الخدمة')}
                            value={r.description} 
                            onChange={(e) => updateRecord(r.id, 'description', e.target.value)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="preview-input mono"
                            type="number"
                            value={r.amount} 
                            onChange={(e) => updateRecord(r.id, 'amount', e.target.value)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="preview-input mono"
                            type="number"
                            value={r.vat} 
                            onChange={(e) => updateRecord(r.id, 'vat', e.target.value)} 
                          />
                        </td>
                        <td className="mono" style={{ fontWeight: 800, paddingLeft: '12px' }}>
                          {r.total.toLocaleString(locale)}
                        </td>
                        <td>
                          <button onClick={() => removeRecord(r.id)} className="fleet-btn-icon" style={{ color: '#EF4444' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    className="fleet-btn-primary" 
                    onClick={addRow}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--fleet-border)', color: '#FFFFFF', padding: '8px 16px' }}
                  >
                    + {t('Add Record', 'إضافة سجل')}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    className="fleet-btn-primary" 
                    style={{ background: 'transparent', border: '1px solid var(--fleet-border)', color: '#FFFFFF', padding: '8px 24px' }}
                    onClick={() => setStep(1)}
                  >
                    {t('Cancel', 'إلغاء')}
                  </button>
                  <button 
                    className="fleet-btn-primary" 
                    style={{ padding: '8px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}
                    onClick={handleSave}
                    disabled={saving || records.filter(r => r.selected).length === 0}
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {t(`Import ${records.filter(r => r.selected).length} Records`, `استيراد ${records.filter(r => r.selected).length} سجلات`)}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: FALLBACK REDIRECT */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ background: 'var(--status-warn-bg)', padding: '20px', borderRadius: '12px', marginBottom: '24px' }}>
                <AlertTriangle size={48} style={{ color: 'var(--status-warn)', margin: '0 auto 16px' }} />
                <h3>{t('Low Confidence Extraction', 'استخراج منخفض الثقة')}</h3>
                <p style={{ color: 'var(--theme-text-muted)', fontSize: '0.9rem' }}>
                  {t('The PDF appears to be a raw scan without searchable text. Would you like to enter the records manually?', 'يبدو أن ملف PDF هو مسح ضوئي خام بدون نص قابل للبحث. هل ترغب في إدخال السجلات يدوياً؟')}
                </p>
              </div>
              <button 
                className="fleet-btn-primary" 
                style={{ width: '100%', marginBottom: '12px' }}
                onClick={() => {
                  setStatementPeriod(`${t('Statement', 'كشف')} ${new Date().toLocaleDateString(locale)}`);
                  setRecords([]);
                  addRow();
                  setStep(3);
                }}
              >
                {t('Proceed to Manual Entry', 'المتابعة للإدخال اليدوي')}
              </button>
              <button 
                onClick={() => setStep(1)}
                style={{ background: 'transparent', border: 'none', color: 'var(--theme-text-muted)', cursor: 'pointer' }}
              >
                {t('Try Another File', 'تجربة ملف آخر')}
              </button>
            </div>
          )}

        </div>
      </div>

      <style>{`
        .fleet-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
        }
        .fleet-modal-content {
          background: var(--theme-surface); border: 1px solid var(--theme-border);
          border-radius: 16px; width: 100%; box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5); overflow: hidden;
        }
        .fleet-modal-header {
          padding: 20px 24px; border-bottom: 1px solid var(--theme-border-light);
          display: flex; justify-content: space-between; align-items: center;
        }
        .upload-dropzone:hover {
          background: var(--theme-accent-soft) !important; border-color: var(--theme-accent) !important;
        }
        .preview-input {
          background: transparent; border: none; color: #FFFFFF;
          width: 100%; padding: 8px 4px; border-radius: 4px;
          outline: none; transition: background 0.2s;
        }
        .preview-input:focus {
          background: rgba(255,255,255,0.05);
          box-shadow: inset 0 0 0 1px var(--theme-accent-border);
        }
        .row-disabled { opacity: 0.4; background: rgba(0,0,0,0.2); }
        .editable-table input[type="number"]::-webkit-inner-spin-button { display: none; }
        @media (max-width: 768px) {
          .fleet-modal-overlay { align-items: flex-end; padding: 0; }
          .fleet-modal-content {
            max-width: 100% !important;
            max-height: 92vh;
            overflow-y: auto;
            border-radius: 20px 20px 0 0;
          }
          .fleet-modal-header { padding: 16px 18px; }
          .fleet-modal-body { padding: 18px !important; }
        }
      `}</style>
    </div>
  );
}
