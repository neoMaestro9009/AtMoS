import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Camera, Mic, ShieldCheck, ChevronRight, Check } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'مرحباً بك في OmniVerse',
      description: 'نظام الوعي الكوني المتكامل. رحلتك نحو التناغم الحيوي والترددي تبدأ هنا.',
      icon: <Activity size={48} className="text-cyan-400" />
    },
    {
      title: 'القياسات الحيوية',
      description: 'نستخدم كاميرا هاتفك والميكروفون لقياس نبض قلبك، معدل تنفسك، ومستوى التوتر بدقة عالية دون الحاجة لأجهزة إضافية.',
      icon: <Camera size={48} className="text-emerald-400" />
    },
    {
      title: 'الخصوصية والسيادة',
      description: 'جميع بياناتك الحيوية تتم معالجتها محلياً على جهازك. لا يتم إرسال أي صور أو تسجيلات صوتية إلى أي خوادم خارجية.',
      icon: <ShieldCheck size={48} className="text-blue-400" />
    },
    {
      title: 'الترددات العلاجية',
      description: 'بناءً على قياساتك، سنقوم بتوليد ترددات صوتية مخصصة (مثل 432Hz و 528Hz) لمساعدتك على الاسترخاء، التركيز، أو النوم العميق.',
      icon: <Mic size={48} className="text-purple-400" />
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center"
        >
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-slate-800/50 rounded-full shadow-inner">
              {steps[step].icon}
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">{steps[step].title}</h2>
          <p className="text-slate-300 mb-8 leading-relaxed">
            {steps[step].description}
          </p>
          
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {steps.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-cyan-500' : 'w-2 bg-slate-700'}`}
                />
              ))}
            </div>
            
            <button 
              onClick={handleNext}
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-full font-bold hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all"
            >
              {step === steps.length - 1 ? (
                <>ابدأ الرحلة <Check size={18} /></>
              ) : (
                <>التالي <ChevronRight size={18} /></>
              )}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
