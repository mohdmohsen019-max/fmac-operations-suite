import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { submitTicket } from '../services/ticketService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';

import './HelpFormWizard.css';

const BRANCHES = ['Fujairah', 'Dibba'];

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

  const [details, setDetails] = useState({
    description: '',
    categories: [],
    against: 'Coach',
    targetName: '',
    department: 'Coaching',
    priority: 'Medium',
    outcome: '',
    meetingWith: 'Club Director',
    date: '',
    role: 'Parent',
    subject: '',
    bestTime: 'Morning',
    notes: '',
    location: 'Main Building',
    busNumber: '',
    urgency: 'Medium',
    issueCategories: []
  });

  useEffect(() => {
    const savedData = sessionStorage.getItem(`fmac_form_${type}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.userInfo) setUserInfo(parsed.userInfo);
        if (parsed.details) setDetails(parsed.details);
      } catch (e) { }
    }
  }, [type]);

  const saveData = (newUserInfo, newDetails) => {
    sessionStorage.setItem(`fmac_form_${type}`, JSON.stringify({ userInfo: newUserInfo, details: newDetails }));
  };

  const handleUserChange = (e) => {
    const nextInfo = { ...userInfo, [e.target.name]: e.target.value };
    setUserInfo(nextInfo);
    saveData(nextInfo, details);
  };

  const handleDetailChange = (e) => {
    const { name, value, type, checked } = e.target;
    let nextDetails;
    if (type === 'checkbox') {
      const currentList = details[name] || [];
      const newList = checked ? [...currentList, value] : currentList.filter(item => item !== value);
      nextDetails = { ...details, [name]: newList };
    } else {
      nextDetails = { ...details, [name]: value };
    }
    setDetails(nextDetails);
    saveData(userInfo, nextDetails);
  };

  const nextStep = () => {
    setSearchParams({ step: currentStep + 1 });
  };

  const prevStep = () => {
    if (currentStep === 1) {
      navigate('/');
    } else {
      setSearchParams({ step: currentStep - 1 });
    }
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

  const renderStepIndicator = () => {
    const percent = (currentStep / 4) * 100;
    return (
      <div className="form-step-wrapper">
        <div className="form-step-text">
          <span>{isAr ? `الخطوة ${currentStep} من 4` : `STEP ${currentStep} OF 4`}</span>
          <span>{percent}%</span>
        </div>
        <div className="form-step-track">
          <div className="form-step-fill" style={{ width: `${percent}%` }} />
        </div>
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
        <label className={isAr ? 'form-label-ar' : 'form-label-en'}>
          {isAr ? 'الاسم الكامل' : 'FULL NAME'} <span className="required-asterisk">*</span>
        </label>
        <input className="form-input" name="name" required value={userInfo.name} onChange={handleUserChange} placeholder={isAr ? 'مثال: أحمد سالم' : 'e.g. Ahmed Salem'} />
      </div>

      <div className="form-group">
        <label className={isAr ? 'form-label-ar' : 'form-label-en'}>
          {isAr ? 'رقم الهاتف' : 'PHONE NUMBER'} <span className="required-asterisk">*</span>
        </label>
        <input className="form-input" name="phone" required value={userInfo.phone} onChange={handleUserChange} placeholder="e.g. 050 123 4567" />
      </div>

      <div className="form-group">
        <label className={isAr ? 'form-label-ar' : 'form-label-en'}>
          {isAr ? 'البريد الإلكتروني' : 'EMAIL ADDRESS'}
        </label>
        <input className="form-input" type="email" name="email" value={userInfo.email} onChange={handleUserChange} placeholder={isAr ? 'اختياري' : 'optional'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="form-group">
          <label className={isAr ? 'form-label-ar' : 'form-label-en'}>
            {isAr ? 'الفرع' : 'BRANCH'} <span className="required-asterisk">*</span>
          </label>
          <select className="form-input" name="branch" value={userInfo.branch} onChange={handleUserChange}>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className={isAr ? 'form-label-ar' : 'form-label-en'}>
            {isAr ? 'الرياضة' : 'SPORT'}
          </label>
          <input className="form-input" name="sport" value={userInfo.sport} onChange={handleUserChange} placeholder={isAr ? 'مثال: جودو' : 'e.g. Judo'} />
        </div>
      </div>

      <div className="form-group">
        <label className={isAr ? 'form-label-ar' : 'form-label-en'}>
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
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
        <h3 className="form-heading-ar">تفاصيل الطلب</h3>
        <h4 className="form-heading-en">REQUEST DETAILS</h4>

        {type === 'inquiry' && (
          <>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'الفئات' : 'INQUIRY CATEGORIES'}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {['البرامج والجداول / Programs & Schedules', 'الرسوم والاشتراكات / Fees & Subscriptions', 'التسجيل / Registration', 'المرافق / Facilities', 'البطولات والفعاليات / Events & Tournaments', 'أخرى / Other'].map(cat => (
                  <label key={cat} className="form-checkbox-label" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
                    <input type="checkbox" className="form-checkbox" name="categories" value={cat} checked={(details.categories || []).includes(cat)} onChange={handleDetailChange} />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'ملاحظات إضافية' : 'ADDITIONAL NOTES'}</label>
              <textarea className="form-input" name="notes" rows={4} value={details.notes} onChange={handleDetailChange} placeholder={isAr ? 'أي تفاصيل إضافية...' : 'Any additional details...'} style={{ resize: 'vertical' }} />
            </div>
          </>
        )}

        {type === 'complaint' && (
          <>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'الشكوى ضد' : 'COMPLAINT AGAINST'} <span className="required-asterisk">*</span></label>
              <select className="form-input" name="against" value={details.against} onChange={handleDetailChange}>
                {['مدرب / Coach', 'موظف إداري / Admin Staff', 'سائق حافلة / Bus Driver', 'لاعب آخر / Other Player', 'المنشأة / Facility', 'أخرى / Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            {['مدرب / Coach', 'سائق حافلة / Bus Driver', 'لاعب آخر / Other Player'].includes(details.against) && (
              <div className="form-group">
                <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'اسم الشخص أو رقم الحافلة' : 'NAME OR BUS NUMBER'}</label>
                <input className="form-input" name="targetName" value={details.targetName} onChange={handleDetailChange} />
              </div>
            )}
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'وصف الشكوى' : 'COMPLAINT DESCRIPTION'} <span className="required-asterisk">*</span></label>
              <textarea className="form-input" name="description" rows={5} required value={details.description} onChange={handleDetailChange} style={{ resize: 'vertical' }} />
            </div>
          </>
        )}

        {type === 'suggestion' && (
          <>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'القسم' : 'DEPARTMENT'}</label>
              <select className="form-input" name="department" value={details.department} onChange={handleDetailChange}>
                {['التدريب / Coaching', 'الإدارة / Administration', 'النقل / Transport', 'المرافق / Facilities', 'الفعاليات / Events', 'أخرى / Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'الأولوية' : 'PRIORITY'}</label>
              <select className="form-input" name="priority" value={details.priority} onChange={handleDetailChange}>
                {['منخفض / Low', 'متوسط / Medium', 'عالي / High'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'النتيجة المتوقعة' : 'EXPECTED OUTCOME'}</label>
              <textarea className="form-input" name="outcome" rows={3} value={details.outcome} onChange={handleDetailChange} style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'وصف الاقتراح' : 'SUGGESTION DETAILS'} <span className="required-asterisk">*</span></label>
              <textarea className="form-input" name="description" rows={4} required value={details.description} onChange={handleDetailChange} style={{ resize: 'vertical' }} />
            </div>
          </>
        )}

        {type === 'meeting' && (
          <>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'الاجتماع مع' : 'MEETING WITH'} <span className="required-asterisk">*</span></label>
              <select className="form-input" name="meetingWith" value={details.meetingWith} onChange={handleDetailChange}>
                {['مدير النادي / Club Director', 'مدير العمليات / Operations Manager', 'المدرب الرئيسي / Head Coach', 'الفريق الإداري / Admin Team'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'التاريخ المفضل' : 'PREFERRED DATE'} <span className="required-asterisk">*</span></label>
              <input type="date" className="form-input" name="date" required value={details.date} onChange={handleDetailChange} />
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'سبب الاجتماع' : 'REASON FOR MEETING'} <span className="required-asterisk">*</span></label>
              <textarea className="form-input" name="description" rows={4} required value={details.description} onChange={handleDetailChange} style={{ resize: 'vertical' }} />
            </div>
          </>
        )}

        {type === 'call' && (
          <>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'صفتك' : 'YOUR ROLE'}</label>
              <select className="form-input" name="role" value={details.role} onChange={handleDetailChange}>
                {['ولي أمر / Parent', 'لاعب / Player', 'مدرب / Coach', 'زائر / Visitor', 'أخرى / Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'موضوع المكالمة' : 'CALL SUBJECT'} <span className="required-asterisk">*</span></label>
              <input className="form-input" name="subject" required value={details.subject} onChange={handleDetailChange} />
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'الوقت المفضل' : 'BEST TIME TO CALL'}</label>
              <select className="form-input" name="bestTime" value={details.bestTime} onChange={handleDetailChange}>
                {['الصباح 8-12 / Morning 8-12', 'الظهر 12-4 / Afternoon 12-4', 'المساء 4-8 / Evening 4-8'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </>
        )}

        {type === 'maintenance' && (
          <>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'الموقع' : 'LOCATION'} <span className="required-asterisk">*</span></label>
              <select className="form-input" name="location" value={details.location} onChange={handleDetailChange}>
                {['المبنى الرئيسي / Main Building', 'الحافلة / Bus', 'أرض التدريب / Training Ground', 'غرف التبديل / Changing Rooms', 'أخرى / Other'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            {details.location === 'الحافلة / Bus' && (
              <div className="form-group">
                <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'رقم الحافلة' : 'BUS NUMBER'}</label>
                <input className="form-input" name="busNumber" value={details.busNumber} onChange={handleDetailChange} />
              </div>
            )}
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'فئة المشكلة' : 'ISSUE CATEGORY'}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {['كهرباء / Electrical', 'سباكة / Plumbing', 'تكييف / AC & Cooling', 'نظافة / Cleaning', 'معدات / Equipment', 'أخرى / Other'].map(cat => (
                  <label key={cat} className="form-checkbox-label" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
                    <input type="checkbox" className="form-checkbox" name="issueCategories" value={cat} checked={(details.issueCategories || []).includes(cat)} onChange={handleDetailChange} />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'درجة الأهمية' : 'URGENCY'}</label>
              <select className="form-input" name="urgency" value={details.urgency} onChange={handleDetailChange}>
                {['منخفض / Low', 'متوسط / Medium', 'عالي / High', 'طارئ / Emergency'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'وصف المشكلة' : 'ISSUE DESCRIPTION'} <span className="required-asterisk">*</span></label>
              <textarea className="form-input" name="description" rows={4} required value={details.description} onChange={handleDetailChange} style={{ resize: 'vertical' }} />
            </div>
          </>
        )}

        {/* Fallback for unknown type */}
        {!['inquiry', 'complaint', 'suggestion', 'meeting', 'call', 'maintenance'].includes(type) && (
          <div className="form-group">
            <label className={isAr ? 'form-label-ar' : 'form-label-en'}>{isAr ? 'الوصف / الرسالة' : 'DESCRIPTION / MESSAGE'} <span className="required-asterisk">*</span></label>
            <textarea className="form-input" name="description" rows={6} required value={details.description} onChange={handleDetailChange} style={{ resize: 'vertical' }} />
          </div>
        )}

        <div className="form-actions-row">
          <button className="form-btn-outline" style={{ flex: 1 }} onClick={prevStep}>
            {isAr ? 'رجوع' : 'BACK'}
          </button>
          <button
            className={`form-btn-primary ${isAr ? 'form-btn-primary-ar' : 'form-btn-primary-en'}`}
            style={{ flex: 2, margin: 0 }}
            disabled={
              (type === 'complaint' && !details.description) ||
              (type === 'suggestion' && !details.description) ||
              (type === 'meeting' && (!details.date || !details.description)) ||
              (type === 'call' && !details.subject) ||
              (type === 'maintenance' && !details.description) ||
              (!['complaint', 'suggestion', 'meeting', 'call', 'maintenance'].includes(type) && !details.description && !details.notes)
            }
            onClick={nextStep}
          >
            {isAr ? 'مراجعة' : 'REVIEW'}
          </button>
        </div>
      </motion.div>
    );
  };

  const renderStep4 = () => (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <h3 className="form-heading-ar">مراجعة وإرسال</h3>
      <h4 className="form-heading-en">REVIEW & SUBMIT</h4>

      <div className="form-summary-box">
        <h4 className="summary-title" style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
          {isAr ? 'المعلومات الشخصية' : 'PERSONAL INFO'}
        </h4>
        <div style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
          <p className="summary-item"><strong>{isAr ? 'الاسم' : 'NAME'}:</strong> {userInfo.name}</p>
          <p className="summary-item"><strong>{isAr ? 'الهاتف' : 'PHONE'}:</strong> {userInfo.phone}</p>
          <p className="summary-item" style={{ marginBottom: 0 }}><strong>{isAr ? 'الفرع' : 'BRANCH'}:</strong> {userInfo.branch}</p>
        </div>
      </div>

      <div className="form-summary-box">
        <h4 className="summary-title" style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
          {isAr ? 'التفاصيل' : 'DETAILS'}
        </h4>
        <div style={{ textAlign: isAr ? 'right' : 'left', direction: isAr ? 'rtl' : 'ltr' }}>
          {Object.entries(details).map(([key, value]) => {
            if (!value || (Array.isArray(value) && value.length === 0)) return null;
            if (key === 'description' || key === 'notes' || key === 'outcome') return <p key={key} className="summary-item" style={{ whiteSpace: 'pre-wrap' }}><strong>{key.toUpperCase()}:</strong><br />{value}</p>;
            if (Array.isArray(value)) return <p key={key} className="summary-item"><strong>{key.toUpperCase()}:</strong> {value.join(', ')}</p>;
            return <p key={key} className="summary-item"><strong>{key.toUpperCase()}:</strong> {value}</p>;
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

  return (
    <div className="fmac-form-page">
      <button
        className="form-back-btn"
        onClick={prevStep}
      >
        <ArrowLeft size={16} />
        <span>{isAr ? 'العودة / BACK' : 'BACK / العودة'}</span>
      </button>

      <div className="fmac-form-container">
        {renderStepIndicator()}

        <AnimatePresence mode="wait">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </AnimatePresence>
      </div>
    </div>
  );
}
