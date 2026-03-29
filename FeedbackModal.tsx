import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, Check } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  bioData: any;
}

export function FeedbackModal({ isOpen, onClose, bioData }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  const [includeData, setIncludeData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      console.log('Feedback submitted:', { feedback, bioData: includeData ? bioData : null });
      setIsSubmitting(false);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setFeedback('');
        onClose();
      }, 2000);
    }, 1000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
        >
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
              <MessageSquare size={24} />
            </div>
            <h2 className="text-xl font-bold text-white">إرسال ملاحظات</h2>
          </div>

          {isSuccess ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={32} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">شكراً لك!</h3>
              <p className="text-slate-400">تم إرسال ملاحظاتك بنجاح. نقدر مساهمتك في تحسين OmniVerse.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  كيف يمكننا تحسين تجربتك؟
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  required
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all resize-none"
                  placeholder="شاركنا رأيك، اقتراحاتك، أو أي مشكلة واجهتك..."
                />
              </div>
              
              <div className="mb-6">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center mt-1">
                    <input 
                      type="checkbox" 
                      checked={includeData}
                      onChange={(e) => setIncludeData(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${includeData ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600 group-hover:border-slate-400'}`}>
                      {includeData && <Check size={14} className="text-white" />}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-200 block">إرفاق بيانات التشخيص</span>
                    <span className="text-xs text-slate-400 block mt-1">
                      يساعدنا إرفاق قراءات المستشعرات الحالية (مثل معدل النبض والتوتر) في فهم المشكلة بشكل أفضل. لن يتم إرسال أي بيانات شخصية.
                    </span>
                  </div>
                </label>
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !feedback.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'جاري الإرسال...' : (
                    <>إرسال <Send size={16} /></>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
