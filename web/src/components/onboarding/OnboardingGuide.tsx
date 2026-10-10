import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { 
  Loader2, 
  Flag, 
  Palette, 
  Zap, 
  Film, 
  Settings, 
  Trash2,
  Clipboard,
  Calendar,
  Heart,
  Award,
  Download,
  Grid,
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  Menu,
  Search,
  Info,
  CheckCircle
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  completed: boolean;
}

const OnboardingSteps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "welcome",
    description: "welcome_description",
    icon: Loader2,
    completed: false,
  },
  {
    id: "magic-canvas",
    title: "magic-canvas",
    description: "magic-canvas_description",
    icon: Film,
    completed: false,
  },
  {
    id: "director-workflow",
    title: "director-workflow",
    description: "director-workflow_description",
    icon: Settings,
    completed: false,
  },
  {
    id: "skills",
    title: "skills",
    description: "skills_description",
    icon: Zap,
    completed: false,
  },
  {
    id: "saved-projects",
    title: "saved-projects",
    description: "saved-projects_description",
    icon: Award,
    completed: false,
  },
];

export function OnboardingGuide() {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(true);

  // Check if onboarding was already completed
  useEffect(() => {
    const completed = localStorage.getItem("onboarding_completed");
    if (completed) {
      setShowOnboarding(false);
    }
  }, []);

  const goToStep = (stepId: number) => {
    setCurrentStep(stepId);
  };

  const completeStep = (stepId: string) => {
    setCompletedSteps((prev) => {
      if (!prev.includes(stepId)) {
        return [...prev, stepId];
      }
      return prev;
    });
    localStorage.setItem("onboarding_completed", JSON.stringify(completedSteps));
    
    // Check if all steps are complete
    const allCompleted = completedSteps.length >= OnboardingSteps.length;
    if (allCompleted) {
      setShowOnboarding(false);
      localStorage.setItem("onboarding_completed", "true");
    } else {
      // Go to next step
      const nextStep = completedSteps.length;
      setCurrentStep(nextStep);
    }
  };

  const skipOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem("onboarding_completed", "true");
  };

  const step = OnboardingSteps[currentStep];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      {showOnboarding && (
        <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden animate-fade-in">
          <div className="p-6 border-b">
            <button
              onClick={skipOnboarding}
              className="absolute right-6 text-gray-500 hover:text-red-500 transition-colors"
            >
              <Info className="size-5" />
            </button>
            <h2 className="text-xl font-bold">{t(step.title)}</h2>
          </div>
          
          <div className="p-6">
            <div className="h-16 w-16 rounded-xl flex items-center justify-center mx-auto mb-4">
              <step.icon className="text-primary-600 text-3xl" />
            </div>
            
            <h3 className="text-lg font-medium text-center mb-2">{t(step.title)}</h3>
            <p className="text-sm text-gray-600 text-center leading-relaxed">{t(step.description)}</p>
          </div>
          
          <div className="p-6 border-t">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                {currentStep + 1}/{OnboardingSteps.length}
              </p>
              <p className="text-sm text-gray-500">
                {completedSteps.length}/{OnboardingSteps.length} {t('completed')}
              </p>
            </div>
            
            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="flex-1 py-2 px-4 rounded-md bg-gray-100 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {t('previous')}
                </button>
              )}
              {currentStep < OnboardingSteps.length - 1 && (
                <button
                  onClick={() => completeStep(step.id)}
                  className="flex-1 py-2 px-4 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
                >
                  {t('next')}
                </button>
              )}
              {completedSteps.length >= OnboardingSteps.length - 1 && currentStep === OnboardingSteps.length - 1 && (
                <button
                  onClick={skipOnboarding}
                  className="flex-1 py-2 px-4 rounded-md bg-gray-100 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {t('skip')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!showOnboarding && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center hidden">
          <div className="bg-white rounded-2xl p-8 shadow-2xl text-center animate-fade-in">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-2xl font-bold mb-4">{t('onboarding_complete')}</h2>
            <p className="text-gray-600 mb-6">{t('onboarding_thank_you')}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 py-2 px-6 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {t('start_using')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}