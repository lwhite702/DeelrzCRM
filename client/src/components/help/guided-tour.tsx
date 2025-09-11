import { useEffect, useRef, useCallback } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { tourSteps, TOUR_CONFIG, type TourStep } from "@/config/tour-steps";
import { useToast } from "@/hooks/use-toast";

interface GuidedTourProps {
  isActive: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onSkip?: () => void;
  onProgress?: (currentStep: number, totalSteps: number, stepId: string) => void;
  startFromStep?: string;
  customSteps?: TourStep[];
  className?: string;
}

export function GuidedTour({
  isActive,
  onStart,
  onComplete,
  onSkip,
  onProgress,
  startFromStep,
  customSteps,
  className = "",
}: GuidedTourProps) {
  const driverRef = useRef<Driver | null>(null);
  const { toast } = useToast();
  const currentStepRef = useRef<string | null>(null);
  const activeStepsRef = useRef<TourStep[]>([]);

  // Filter and prepare tour steps
  const prepareSteps = useCallback(() => {
    const steps = customSteps || tourSteps;
    const currentPath = window.location.pathname;

    // Filter steps based on current path and conditions
    const availableSteps = steps.filter(step => {
      // Check if step has a required path and if current path matches
      if (step.requiredPath && step.requiredPath !== currentPath) {
        return false;
      }

      // Check conditional requirements
      if (step.conditional && !step.conditional()) {
        return false;
      }

      // Check if target element exists
      const element = document.querySelector(step.element);
      if (!element) {
        console.warn(`Tour step "${step.id}" target not found: ${step.element}`);
        return false;
      }

      return true;
    });

    return availableSteps;
  }, [customSteps]);

  // Convert tour steps to driver.js format
  const convertStepsToDriverFormat = useCallback((steps: TourStep[]) => {
    return steps.map((step, index) => ({
      element: step.element,
      popover: {
        title: step.title,
        description: step.description,
        side: step.position || 'bottom',
        align: 'start',
        showButtons: step.popover?.showButtons || TOUR_CONFIG.showButtons,
        nextBtnText: step.popover?.nextBtnText || TOUR_CONFIG.nextBtnText,
        prevBtnText: step.popover?.prevBtnText || TOUR_CONFIG.prevBtnText,
        closeBtnText: step.popover?.closeBtnText || TOUR_CONFIG.closeBtnText,
        doneBtnText: index === steps.length - 1 ? TOUR_CONFIG.doneBtnText : TOUR_CONFIG.nextBtnText,
        showProgress: TOUR_CONFIG.showProgress,
        progressText: TOUR_CONFIG.progressText,
        onNextClick: () => {
          if (step.onNext) {
            step.onNext();
            
            // Small delay to allow navigation to complete
            setTimeout(() => {
              if (driverRef.current) {
                const nextIndex = index + 1;
                if (nextIndex < steps.length) {
                  const nextStep = steps[nextIndex];
                  const nextElement = document.querySelector(nextStep.element);
                  if (nextElement) {
                    driverRef.current.moveNext();
                  } else {
                    // Element not found, try to wait for it or skip
                    setTimeout(() => {
                      const retryElement = document.querySelector(nextStep.element);
                      if (retryElement) {
                        driverRef.current?.moveNext();
                      } else {
                        toast({
                          title: "Navigation needed",
                          description: `Please navigate to the required page to continue the tour.`,
                          variant: "default",
                        });
                      }
                    }, 1000);
                  }
                } else {
                  driverRef.current.moveNext();
                }
              }
            }, 500);
            return; // Prevent default next behavior
          }
          
          // Default next behavior
          driverRef.current?.moveNext();
        },
        onPrevClick: () => {
          if (step.onPrev) {
            step.onPrev();
            setTimeout(() => {
              driverRef.current?.movePrevious();
            }, 500);
            return;
          }
          driverRef.current?.movePrevious();
        },
        onCloseClick: () => {
          handleTourSkip();
        },
      },
      onHighlightStarted: () => {
        currentStepRef.current = step.id;
        
        // Report progress
        if (onProgress) {
          onProgress(index + 1, steps.length, step.id);
        }

        // Auto-scroll to element if needed
        const element = document.querySelector(step.element);
        if (element) {
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'center'
          });
        }
      },
      onHighlighted: () => {
        // Add custom styling or animations
        const element = document.querySelector(step.element);
        if (element) {
          element.classList.add('tour-highlighted');
        }
      },
      onDeselected: () => {
        // Remove custom styling
        const element = document.querySelector(step.element);
        if (element) {
          element.classList.remove('tour-highlighted');
        }
      },
    }));
  }, [onProgress, toast]);

  // Handle tour completion
  const handleTourComplete = useCallback(() => {
    if (onComplete) {
      onComplete();
    }
    
    toast({
      title: "Tour completed! 🎉",
      description: "You've successfully completed the guided tour. You can replay it anytime from the Help menu.",
      variant: "default",
    });
  }, [onComplete, toast]);

  // Handle tour skip
  const handleTourSkip = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
      driverRef.current = null;
    }
    
    if (onSkip) {
      onSkip();
    }
    
    toast({
      title: "Tour skipped",
      description: "You can restart the tour anytime from the Help menu.",
      variant: "default",
    });
  }, [onSkip, toast]);

  // Initialize the driver
  const initializeDriver = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
    }

    const availableSteps = prepareSteps();
    if (availableSteps.length === 0) {
      console.warn("No tour steps available for current page");
      return;
    }

    activeStepsRef.current = availableSteps;
    const driverSteps = convertStepsToDriverFormat(availableSteps);

    driverRef.current = driver({
      ...TOUR_CONFIG,
      steps: driverSteps,
      onDestroyed: () => {
        currentStepRef.current = null;
        driverRef.current = null;
      },
      onDestroyStarted: () => {
        if (currentStepRef.current === 'tour-complete' || 
            activeStepsRef.current.findIndex(s => s.id === currentStepRef.current) === activeStepsRef.current.length - 1) {
          handleTourComplete();
        }
      },
    });

    return driverRef.current;
  }, [prepareSteps, convertStepsToDriverFormat, handleTourComplete]);

  // Start the tour
  const startTour = useCallback(() => {
    try {
      const driverInstance = initializeDriver();
      if (!driverInstance) {
        toast({
          title: "Tour unavailable",
          description: "The tour is not available on this page. Please navigate to the dashboard to start the tour.",
          variant: "destructive",
        });
        return;
      }

      if (onStart) {
        onStart();
      }

      // Find starting step index
      let startIndex = 0;
      if (startFromStep) {
        const stepIndex = activeStepsRef.current.findIndex(step => step.id === startFromStep);
        if (stepIndex >= 0) {
          startIndex = stepIndex;
        }
      }

      driverInstance.drive(startIndex);
    } catch (error) {
      console.error("Failed to start tour:", error);
      toast({
        title: "Tour error",
        description: "Failed to start the tour. Please try again.",
        variant: "destructive",
      });
    }
  }, [initializeDriver, onStart, startFromStep, toast]);

  // Stop the tour
  const stopTour = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
      driverRef.current = null;
    }
  }, []);

  // Effect to handle isActive prop
  useEffect(() => {
    if (isActive) {
      startTour();
    } else {
      stopTour();
    }

    return () => {
      stopTour();
    };
  }, [isActive, startTour, stopTour]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
      }
    };
  }, []);

  // Handle route changes - update available steps
  useEffect(() => {
    const handleRouteChange = () => {
      if (driverRef.current && driverRef.current.isActivated) {
        // Re-initialize driver with steps for new route
        const currentStep = currentStepRef.current;
        stopTour();
        
        // Small delay to allow page to load
        setTimeout(() => {
          if (isActive) {
            startTour();
          }
        }, 1000);
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [isActive, startTour, stopTour]);

  // Public API for external control
  const tourAPI = {
    start: startTour,
    stop: stopTour,
    next: () => driverRef.current?.moveNext(),
    previous: () => driverRef.current?.movePrevious(),
    goToStep: (stepId: string) => {
      const stepIndex = activeStepsRef.current.findIndex(step => step.id === stepId);
      if (stepIndex >= 0 && driverRef.current) {
        driverRef.current.drive(stepIndex);
      }
    },
    isActive: () => driverRef.current?.isActivated || false,
    getCurrentStep: () => currentStepRef.current,
    getAvailableSteps: () => activeStepsRef.current,
  };

  // Expose API via ref for parent components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).guidedTourAPI = tourAPI;
    }
  }, []);

  // This component doesn't render any visible UI
  // The tour overlay is managed by driver.js
  return null;
}

export default GuidedTour;