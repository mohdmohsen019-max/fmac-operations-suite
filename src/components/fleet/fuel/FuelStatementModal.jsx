import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle, Fuel, Calendar, DollarSign, Droplets, Upload, FileCheck, Loader2 } from 'lucide-react';
import { db } from '../../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../../../contexts/LanguageContext';
import CustomSelect from '../../CustomSelect';
import * as XLSX from 'xlsx';

export default function FuelStatementModal({ isOpen, onClose, onSave }) {
  const { t, locale } = useLanguage();
  const [formData, setFormData] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    totalLitres: 0,
    totalCost: 0,
    pricePerLitre: '', // AED per litre — the one manual input the statement lacks
    notes: '',
    vehicleAllocations: [] // Extracted per-vehicle data
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const fileInputRef = useRef(null);

  const months = [
    t("January", "يناير"), t("February", "فبراير"), t("March", "مارس"), 
    t("April", "أبريل"), t("May", "مايو"), t("June", "يونيو"),
    t("July", "يوليو"), t("August", "أغسطس"), t("September", "سبتمبر"), 
    t("October", "أكتوبر"), t("November", "نوفمبر"), t("December", "ديسمبر")
  ];

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsParsing(true);
    setError(null);
    setFileInfo({ name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) throw new Error(t("The Excel file seems to be empty.", "يبدو أن ملف إكسل فارغ."));

        // Extraction Logic
        let totalCost = 0;
        let totalLitres = 0;
        const allocations = [];

        data.forEach((row) => {
          // Normalize row keys (remove spaces, newlines, lowercase) for robust matching
          const normalizedRow = {};
          Object.keys(row).forEach(key => {
            const cleanKey = key.toLowerCase().replace(/[\r\n\s]/g, '');
            normalizedRow[cleanKey] = row[key];
          });

          // Match specific ADNOC columns using normalized keys
          const tokenName = String(normalizedRow['tokenname'] || '').trim();
          
          // Skip the 'Total' row at the bottom of ADNOC statements to avoid double counting
          if (tokenName.toLowerCase().includes('total')) return;

          // Robust parsing to handle commas in strings (e.g. "1,852.64" -> 1852.64)
          const parseNumeric = (val) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            return parseFloat(String(val).replace(/,/g, '')) || 0;
          };

          const quantity = parseNumeric(normalizedRow['totalquantity']);
          // Look for 'totalamount(aed)' or just 'totalamount'
          const totalAmount = parseNumeric(normalizedRow['totalamount(aed)'] || normalizedRow['totalamount']);

          if (tokenName && (quantity > 0 || totalAmount > 0)) {
            // Transform Plate: "PVT FUJ 37074C" or "PVT FUJ 33876 A" -> "C37074" / "A33876"
            let plate = tokenName.replace('PVT FUJ', '').trim();
            
            // Extract the letter (Code) and the numbers
            const match = plate.match(/(\d+)\s*([A-Z])/i);
            if (match) {
              const numbers = match[1];
              const code = match[2].toUpperCase();
              plate = `${code}${numbers}`;
            } else {
              plate = plate.replace(/\s/g, '').toUpperCase();
            }

            totalLitres += quantity;
            totalCost += totalAmount;
            
            allocations.push({
              plate,
              litres: quantity,
              cost: totalAmount
            });
          }
        });

        if (allocations.length === 0) {
          throw new Error(t("Could not find any valid plate numbers or values in the file. Ensure columns are named 'Plate Number', 'Quantity', and 'Amount'.", "لم يتم العثور على أرقام لوحات أو قيم صالحة في الملف. تأكد من تسمية الأعمدة بـ 'Plate Number' و 'Quantity' و 'Amount'."));
        }

        setFormData(prev => ({
          ...prev,
          totalLitres: Math.round(totalLitres * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          vehicleAllocations: allocations
        }));

      } catch (err) {
        setError(err.message);
        setFileInfo(null);
      }
      setIsParsing(false);
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      if (formData.totalCost === 0) {
        throw new Error(t("Please upload a valid ADNOC statement first.", "يرجى تحميل كشف حساب أدنوك صالح أولاً."));
      }

      const parsedPrice = parseFloat(formData.pricePerLitre);
      await addDoc(collection(db, 'fuelStatements'), {
        ...formData,
        pricePerLitre: Number.isFinite(parsedPrice) && parsedPrice > 0
          ? Math.round(parsedPrice * 1000) / 1000
          : null,
        monthName: months[formData.month - 1],
        createdAt: serverTimestamp()
      });

      onSave();
      onClose();
      // Reset
      setFormData({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        totalLitres: 0,
        totalCost: 0,
        pricePerLitre: '',
        notes: '',
        vehicleAllocations: []
      });
      setFileInfo(null);
    } catch (err) {
      setError(err.message);
    }
    setIsSaving(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          style={{ 
            width: '100%', 
            maxWidth: '550px', 
            background: 'var(--fuel-surface)', 
            border: '1px solid var(--fuel-border)',
            borderRadius: '24px',
            position: 'relative',
            zIndex: 1001,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          {/* Header */}
          <div style={{ padding: '24px', borderBottom: '1px solid var(--fuel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--theme-surface-pearl)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--fuel-orange-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--fuel-border)' }}>
                <Fuel size={22} color="var(--fuel-amber)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 850, color: 'var(--theme-text-main)', letterSpacing: '-0.02em' }}>{t('Fuel Data Extraction', 'استخراج بيانات الوقود')}</h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>{t('Upload ADNOC Excel Statement', 'تحميل كشف حساب أدنوك (إكسل)')}</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border-light)', color: 'var(--theme-text-muted)', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '28px' }}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#EF4444', fontSize: '0.85rem', marginBottom: '24px' }}
              >
                <AlertCircle size={18} /> {error}
              </motion.div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div className="fuel-input-group">
                <label className="fuel-kpi-label">{t('Reporting Month', 'شهر التقرير')}</label>
                <CustomSelect
                  value={formData.month}
                  onChange={(v) => setFormData({ ...formData, month: v })}
                  options={months.map((m, i) => ({ value: i + 1, label: m }))}
                />
              </div>
              <div className="fuel-input-group">
                <label className="fuel-kpi-label">{t('Reporting Year', 'سنة التقرير')}</label>
                <input
                  type="number"
                  className="fuel-input"
                  value={formData.year}
                  onChange={e => setFormData({...formData, year: parseInt(e.target.value)})}
                />
              </div>
            </div>

            <div className="fuel-input-group" style={{ marginBottom: '24px' }}>
              <label className="fuel-kpi-label">{t('Price per Litre (AED)', 'سعر اللتر (درهم)')}</label>
              <input
                type="number"
                className="fuel-input"
                min="0"
                step="0.001"
                placeholder={
                  formData.totalLitres > 0
                    ? t(
                        `Implied from statement: ${(formData.totalCost / formData.totalLitres).toFixed(3)}`,
                        `المستنتج من الكشف: ${(formData.totalCost / formData.totalLitres).toFixed(3)}`
                      )
                    : t('e.g. 3.140', 'مثال: 3.140')
                }
                value={formData.pricePerLitre}
                onChange={e => setFormData({ ...formData, pricePerLitre: e.target.value })}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)' }}>
                {t(
                  'The official pump price this month. Leave empty to derive it from cost ÷ litres.',
                  'سعر المضخة الرسمي لهذا الشهر. اتركه فارغاً ليُحسب من التكلفة ÷ اللترات.'
                )}
              </span>
            </div>

            {/* UPLOAD ZONE */}
            <div 
              onClick={() => fileInputRef.current.click()}
              style={{ 
                border: `2px dashed ${fileInfo ? 'var(--fuel-amber)' : 'var(--theme-border-light)'}`,
                borderRadius: '16px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: fileInfo ? 'var(--theme-accent-glow)' : 'var(--theme-surface)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                marginBottom: '24px'
              }}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx, .xls" 
                style={{ display: 'none' }} 
              />
              {isParsing ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div className="app-loader"><span /><span /><span /><span /><span /></div>
                  <span style={{ fontSize: '0.9rem', color: 'var(--fuel-amber)', fontWeight: 600 }}>{t('Analyzing Statement Architecture...', 'تحليل بنية الكشف...')}</span>
                </div>
              ) : fileInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={32} color="var(--fuel-amber)" />
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--theme-text-main)' }}>{fileInfo.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--fuel-text-muted)' }}>{fileInfo.size} — {t('Extraction Complete', 'اكتمل الاستخراج')}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Upload size={32} color="var(--theme-text-muted)" />
                  <div>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--theme-text-main)', display: 'block' }}>{t('Drop ADNOC Excel Here', 'ألقِ ملف إكسل أدنوك هنا')}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>{t('Click to browse .xlsx files', 'انقر لتصفح ملفات .xlsx')}</span>
                  </div>
                </div>
              )}
            </div>

            {fileInfo && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ background: 'var(--theme-accent-soft)', borderRadius: '16px', padding: '20px', marginBottom: '24px', border: '1px solid var(--theme-border-light)' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <div className="fuel-kpi-label" style={{ marginBottom: '4px' }}>{t('Extracted Volume', 'الحجم المستخرج')}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--fuel-amber)' }}>
                      {formData.totalLitres.toLocaleString(locale)} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>LTR</span>
                    </div>
                  </div>
                  <div>
                    <div className="fuel-kpi-label" style={{ marginBottom: '4px' }}>{t('Extracted Cost', 'التكلفة المستخرجة')}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--fuel-amber)' }}>
                      AED {formData.totalCost.toLocaleString(locale)}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--theme-border-light)', fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                  {t(`Detected ${formData.vehicleAllocations.length} vehicles in this statement.`, `تم اكتشاف ${formData.vehicleAllocations.length} مركبة في هذا الكشف.`)}
                </div>
              </motion.div>
            )}

            <div className="fuel-input-group">
              <label className="fuel-kpi-label">{t('Notes (Optional)', 'ملاحظات (اختياري)')}</label>
              <textarea 
                className="fuel-input" 
                style={{ minHeight: '60px', resize: 'none' }}
                placeholder={t('Internal references or remarks...', 'مراجع داخلية أو ملاحظات...')}
                value={formData.notes} 
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>

            <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
              <button 
                type="button" 
                onClick={onClose} 
                style={{ flex: 1, background: 'var(--theme-surface)', color: 'var(--theme-text-main)', border: '1px solid var(--theme-border-light)', padding: '14px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                {t('Cancel', 'إلغاء')}
              </button>
              <button 
                type="submit" 
                disabled={isSaving || !fileInfo}
                className="fuel-btn-action" 
                style={{ 
                  flex: 2, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '10px',
                  opacity: !fileInfo ? 0.5 : 1,
                  cursor: !fileInfo ? 'not-allowed' : 'pointer'
                }}
              >
                {isSaving ? (
                  <><Loader2 size={20} className="animate-spin" /> {t('Finalizing...', 'جارٍ الإنهاء...')}</>
                ) : (
                  <><FileCheck size={20} /> {t('Finalize Intelligence Save', 'إنهاء حفظ البيانات الذكية')}</>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
