import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, Check, ShieldCheck } from 'lucide-react';
import { submitTicket } from '../services/ticketService';
import { useLanguage } from '../../../contexts/LanguageContext';
import CustomSelect from '../../CustomSelect';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import {
  TYPE_SCHEMA, emptyDetailsFor, visibleFields, detailsComplete,
  optValue, displayValue,
} from '../ticketSchema';

import './HelpFormWizard.css';

const BRANCHES = ['Fujairah', 'Dibba', 'Al Bidya'];

const TYPE_ICONS = {
  inquiry:     'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  complaint:   'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  suggestion:  'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  meeting:     'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  call:        'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  maintenance: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

const STEP_LABELS = [
  { ar: 'النوع',    en: 'TYPE' },
  { ar: 'البيانات', en: 'INFO' },
  { ar: 'التفاصيل', en: 'DETAILS' },
  { ar: 'إرسال',    en: 'REVIEW' },
];

const TYPE_TRANSLATIONS = {
  inquiry: { ar: 'استفسار عام', en: 'Inquiry' },
  complaint: { ar: 'تقديم شكوى', en: 'Complaint' },
  suggestion: { ar: 'تقديم اقتراح', en: 'Suggestion' },
  meeting: { ar: 'طلب اجتماع', en: 'Meeting' },
  call: { ar: 'طلب مكالمة', en: 'Call' },
  maintenance: { ar: 'مشكلة صيانة', en: 'Maintenance' },
};

const TITLE_TRANSLATIONS = {
  inquiry: 'General Inquiry — FMAC Operations Suite',
  complaint: 'File a Complaint — FMAC Operations Suite',
  suggestion: 'Make a Suggestion — FMAC Operations Suite',
  meeting: 'Request a Meeting — FMAC Operations Suite',
  call: 'Request a Call — FMAC Operations Suite',
  maintenance: 'Maintenance Issue — FMAC Operations Suite',
};

/* Keep only the keys that belong to this type (drops any stale cached keys). */
function pickKnown(type, obj) {
  const schema = TYPE_SCHEMA[type];
  if (!schema) return { description: obj.description || '' };
  const out = {};
  schema.fields.forEach((f) => { if (obj[f.key] !== undefined) out[f.key] = obj[f.key]; });
  return out;
}

export default function HelpFormWizard() {
  const { type } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentStep = parseInt(searchParams.get('step') || '1');
  const navigate = useNavigate();

  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = TITLE_TRANSLATIONS[type] || "FMAC Operations Suite";
  }, [type]);

  const [userInfo, setUserInfo] = useState({
    name: '',
    phone: '',
    email: '',
    branch: 'Fujairah',
    playerName: '',
    sport: ''
  });

  // Details holds ONLY the selected type's own fields — no cross-type leakage.
  const [details, setDetails] = useState(() => emptyDetailsFor(type));

  useEffect(() => {
    const savedData = sessionStorage.getItem(`fmac_form_${type}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.userInfo) setUserInfo((u) => ({ ...u, ...parsed.userInfo }));
        // Merge saved values over a fresh, type-scoped shell so only this
        // type's keys survive even if an older cache carried extra keys.
        if (parsed.details) { setDetails({ ...emptyDetailsFor(type), ...pickKnown(type, parsed.details) }); return; }
      } catch (e) { /* ignore */ }
    }
    setDetails(emptyDetailsFor(type));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const saveData = (newUserInfo, newDetails) => {
    sessionStorage.setItem(`fmac_form_${type}`, JSON.stringify({ userInfo: newUserInfo, details: newDetails }));
  };

  const handleUserChange = (e) => {
    const nextInfo = { ...userInfo, [e.target.name]: e.target.value };
    setUserInfo(nextInfo);
    saveData(nextInfo, details);
  };

  const setField = (name, value) => {
    const nextDetails = { ...details, [name]: value };
    setDetails(nextDetails);
    saveData(userInfo, nextDetails);
  };

  const toggleCheck = (name, value, checked) => {
    const currentList = details[name] || [];
    const newList = checked ? [...currentList, value] : currentList.filter((item) => item !== value);
    setField(name, newList);
  };

  const nextStep = () => setSearchParams({ step: currentStep + 1 });
  const prevStep = () => {
    if (currentStep === 1) navigate('/');
    else setSearchParams({ step: currentStep - 1 });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const ticketId = await submitTicket(type, userInfo, details);
      sessionStorage.removeItem(`fmac_form_${type}`);
      navigate(`/submit/success/${ticketId}`);
    } catch (err) {
      console.error(err);
      alert(t("Failed to submit request. Please try again later.", "فشل تقديم الطلب. يرجى المحاولة لاحقاً."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeNameAr = TYPE_TRANSLATIONS[type]?.ar || type;
  const typeNameEn = TYPE_TRANSLATIONS[type]?.en || type;

  const renderStepIndicator = () => (
    <div className="wiz-steps" dir="ltr">
      {STEP_LABELS.map((s, i) => {
        const n = i + 1;
        const state = n < currentStep ? 'done' : n === currentStep ? 'active' : '';
        return (
          <React.Fragment key={n}>
            {i > 0 && <div className={`wiz-step-line ${n <= currentStep ? 'fill' : ''}`} />}
            <div className={`wiz-step ${state}`}>
              <span className="wiz-step-node">
                {n < currentStep ? <Check size={12} strokeWidth={3} /> : n}
              </span>
              <span className="wiz-step-label">{isAr ? s.ar : s.en}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  const labelClass = isAr ? 'form-label-ar' : 'form-label-en';
  const fieldLabel = (f) => (isAr ? f.ar : f.en);
  const placeholder = (f) => (isAr ? (f.placeholderAr || '') : (f.placeholderEn || ''));

  /* One field, rendered from the schema. */
  const renderField = (f) => {
    const req = f.required ? <span className="required-asterisk">*</span> : null;
    if (f.kind === 'select') {
      return (
        <div className="form-group" key={f.key}>
          <label className={labelClass}>{fieldLabel(f)} {req}</label>
          <CustomSelect
            value={details[f.key] || ''}
            onChange={(v) => setField(f.key, v)}
            placeholder={isAr ? 'اختر…' : 'Select…'}
            options={f.options.map((o) => ({ value: optValue(o), label: optValue(o) }))}
          />
        </div>
      );
    }
    if (f.kind === 'textarea') {
      return (
        <div className="form-group" key={f.key}>
          <label className={labelClass}>{fieldLabel(f)} {req}</label>
          <textarea className="form-input" rows={f.key === 'description' || f.key === 'notes' || f.key === 'reason' ? 5 : 3}
            value={details[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)}
            placeholder={placeholder(f)} style={{ resize: 'vertical' }} />
        </div>
      );
    }
    if (f.kind === 'date') {
      return (
        <div className="form-group" key={f.key}>
          <label className={labelClass}>{fieldLabel(f)} {req}</label>
          <input type="date" className="form-input" value={details[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)} />
        </div>
      );
    }
    if (f.kind === 'checkgroup') {
      return (
        <div className="form-group" key={f.key}>
          <label className={labelClass}>{fieldLabel(f)} {req}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {f.options.map((o) => {
              const val = optValue(o);
              return (
                <label key={val} className="form-checkbox-label" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
                  <input type="checkbox" className="form-checkbox" value={val}
                    checked={(details[f.key] || []).includes(val)}
                    onChange={(e) => toggleCheck(f.key, val, e.target.checked)} />
                  {isAr ? o.ar : o.en}
                </label>
              );
            })}
          </div>
        </div>
      );
    }
    // text
    return (
      <div className="form-group" key={f.key}>
        <label className={labelClass}>{fieldLabel(f)} {req}</label>
        <input className="form-input" value={details[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)} placeholder={placeholder(f)} />
      </div>
    );
  };

  const renderStep1 = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h3 className="form-heading-ar">تأكيد نوع الخدمة</h3>
      <h4 className="form-heading-en">CONFIRM SERVICE TYPE</h4>

      <p className="form-subtext">
        {isAr
          ? `أنت على وشك تقديم طلب: ${typeNameAr}`
          : `You are about to submit a request for: ${typeNameEn.toUpperCase()}`
        }
      </p>

      <button
        className={`form-btn-primary ${isAr ? 'form-btn-primary-ar' : 'form-btn-primary-en'}`}
        onClick={nextStep}
      >
        {isAr ? 'متابعة' : 'CONTINUE'}
      </button>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <h3 className="form-heading-ar">المعلومات الشخصية</h3>
      <h4 className="form-heading-en">PERSONAL INFORMATION</h4>

      <div className="form-group">
        <label className={labelClass}>
          {isAr ? 'الاسم الكامل' : 'FULL NAME'} <span className="required-asterisk">*</span>
        </label>
        <input className="form-input" name="name" required value={userInfo.name} onChange={handleUserChange} placeholder={isAr ? 'مثال: أحمد سالم' : 'e.g. Ahmed Salem'} />
      </div>

      <div className="form-group">
        <label className={labelClass}>
          {isAr ? 'رقم الهاتف' : 'PHONE NUMBER'} <span className="required-asterisk">*</span>
        </label>
        <input className="form-input" name="phone" required value={userInfo.phone} onChange={handleUserChange} placeholder="e.g. 050 123 4567" />
        <p className="form-hint" dir="auto">
          {isAr
            ? 'سنستخدم آخر ٤ أرقام من هاتفك للتحقق من هويتك عند متابعة الطلب لاحقاً.'
            : 'The last 4 digits of your phone verify you when you track this request later.'}
        </p>
      </div>

      <div className="form-group">
        <label className={labelClass}>
          {isAr ? 'البريد الإلكتروني' : 'EMAIL ADDRESS'}
        </label>
        <input className="form-input" type="email" name="email" value={userInfo.email} onChange={handleUserChange} placeholder={isAr ? 'اختياري' : 'optional'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="form-group">
          <label className={labelClass}>
            {isAr ? 'الفرع' : 'BRANCH'} <span className="required-asterisk">*</span>
          </label>
          <CustomSelect value={userInfo.branch} onChange={(v) => handleUserChange({ target: { name: 'branch', value: v } })}
            options={BRANCHES.map(b => ({ value: b, label: b }))} />
        </div>
        <div className="form-group">
          <label className={labelClass}>
            {isAr ? 'الرياضة' : 'SPORT'}
          </label>
          <input className="form-input" name="sport" value={userInfo.sport} onChange={handleUserChange} placeholder={isAr ? 'مثال: جودو' : 'e.g. Judo'} />
        </div>
      </div>

      <div className="form-group">
        <label className={labelClass}>
          {isAr ? 'اسم اللاعب (إن وجد)' : 'PLAYER NAME (IF APPLICABLE)'}
        </label>
        <input className="form-input" name="playerName" value={userInfo.playerName} onChange={handleUserChange} />
      </div>

      <div className="form-actions-row">
        <button className="form-btn-outline" style={{ flex: 1 }} onClick={prevStep}>
          {isAr ? 'رجوع' : 'BACK'}
        </button>
        <button
          className={`form-btn-primary ${isAr ? 'form-btn-primary-ar' : 'form-btn-primary-en'}`}
          style={{ flex: 2, margin: 0 }}
          disabled={!userInfo.name || !userInfo.phone}
          onClick={nextStep}
        >
          {isAr ? 'متابعة' : 'CONTINUE'}
        </button>
      </div>
    </motion.div>
  );

  const renderStep3 = () => {
    const fields = visibleFields(type, details);
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
        <h3 className="form-heading-ar">تفاصيل الطلب</h3>
        <h4 className="form-heading-en">REQUEST DETAILS</h4>

        {fields.length > 0
          ? fields.map(renderField)
          : (
            <div className="form-group">
              <label className={labelClass}>{isAr ? 'الوصف / الرسالة' : 'DESCRIPTION / MESSAGE'} <span className="required-asterisk">*</span></label>
              <textarea className="form-input" rows={6} value={details.description || ''} onChange={(e) => setField('description', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          )}

        <div className="form-actions-row">
          <button className="form-btn-outline" style={{ flex: 1 }} onClick={prevStep}>
            {isAr ? 'رجوع' : 'BACK'}
          </button>
          <button
            className={`form-btn-primary ${isAr ? 'form-btn-primary-ar' : 'form-btn-primary-en'}`}
            style={{ flex: 2, margin: 0 }}
            disabled={!detailsComplete(type, details)}
            onClick={nextStep}
          >
            {isAr ? 'مراجعة' : 'REVIEW'}
          </button>
        </div>
      </motion.div>
    );
  };

  const renderStep4 = () => {
    const fields = visibleFields(type, details).filter((f) => {
      const v = details[f.key];
      return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
    });
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
        <h3 className="form-heading-ar">مراجعة وإرسال</h3>
        <h4 className="form-heading-en">REVIEW & SUBMIT</h4>

        <div className="form-summary-box">
          <h4 className="summary-title" style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
            {isAr ? 'المعلومات الشخصية' : 'PERSONAL INFO'}
          </h4>
          <div style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
            <p className="summary-item"><strong>{isAr ? 'الاسم' : 'Name'}:</strong> {userInfo.name}</p>
            <p className="summary-item"><strong>{isAr ? 'الهاتف' : 'Phone'}:</strong> {userInfo.phone}</p>
            {userInfo.email && <p className="summary-item"><strong>{isAr ? 'البريد' : 'Email'}:</strong> {userInfo.email}</p>}
            <p className="summary-item" style={{ marginBottom: 0 }}><strong>{isAr ? 'الفرع' : 'Branch'}:</strong> {userInfo.branch}</p>
          </div>
        </div>

        <div className="form-summary-box">
          <h4 className="summary-title" style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
            {isAr ? 'تفاصيل الطلب' : 'REQUEST DETAILS'}
          </h4>
          <div style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
            {fields.map((f) => {
              const multiline = f.kind === 'textarea';
              return (
                <p key={f.key} className="summary-item" style={multiline ? { whiteSpace: 'pre-wrap' } : undefined}>
                  <strong>{fieldLabel(f)}:</strong>{multiline ? <br /> : ' '}{displayValue(f, details[f.key])}
                </p>
              );
            })}
          </div>
        </div>

        <div className="form-actions-row">
          <button className="form-btn-outline" style={{ flex: 1 }} onClick={prevStep}>
            {isAr ? 'تعديل' : 'EDIT'}
          </button>
          <button
            className={`form-btn-primary ${isAr ? 'form-btn-primary-ar' : 'form-btn-primary-en'}`}
            style={{ flex: 2, margin: 0 }}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : (isAr ? 'تأكيد وإرسال' : 'SUBMIT')}
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="fmac-form-page">
      <button
        className="form-back-btn"
        onClick={prevStep}
      >
        <ArrowLeft size={16} />
        <span>{isAr ? 'العودة' : 'Back'}</span>
      </button>

      <motion.div
        className="fmac-form-container"
        initial={{ opacity: 0, y: 26, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Service identity header */}
        <div className="wiz-type-head">
          <div className="wiz-type-icon">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d={TYPE_ICONS[type] || TYPE_ICONS.inquiry} />
            </svg>
          </div>
          <div className="wiz-type-names">
            <span className="wiz-type-ar">{typeNameAr}</span>
            <span className="wiz-type-en">{typeNameEn}</span>
          </div>
        </div>

        {renderStepIndicator()}

        <AnimatePresence mode="wait">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </AnimatePresence>
      </motion.div>

      {/* Trust footer — privacy of the submitted data */}
      <div className="wiz-trust" dir="auto">
        <ShieldCheck size={13} />
        {isAr ? 'بياناتك محفوظة بسرّية وتُستخدم فقط لمعالجة طلبك.' : 'Your data is kept confidential and used only to handle your request.'}
      </div>
    </div>
  );
}
