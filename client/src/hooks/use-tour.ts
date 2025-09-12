import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { UserSettings } from "@shared/schema";

interface TourProgress {
  currentStepId?: string;
  completedSteps: string[];
  skippedSteps: string[];
  startedAt?: string;
  lastActiveAt?: string;
}

interface UseTourOptions {
  autoStartForNewUsers?: boolean;
  persistProgress?: boolean;
}

interface UseTourReturn {
  // Tour state
  isLoading: boolean;
  isTourActive: boolean;
  hasCompletedTour: boolean;
  tourProgress: TourProgress | null;
  
  // User settings
  userSettings: UserSettings | undefined;
  
  // Tour controls
  startTour: (fromStep?: string) => Promise<void>;
  completeTour: () => Promise<void>;
  skipTour: () => Promise<void>;
  resumeTour: () => Promise<void>;
  updateTourProgress: (stepId: string, action: 'completed' | 'skipped') => Promise<void>;
  resetTour: () => Promise<void>;
  
  // Tour configuration
  shouldShowTourPrompt: boolean;
  canResumeTour: boolean;
  
  // Settings management
  updateUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
}

export function useTour(options: UseTourOptions = {}): UseTourReturn {
  const { autoStartForNewUsers = true, persistProgress = true } = options;
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isTourActive, setIsTourActive] = useState(false);

  // Fetch user settings
  const { 
    data: userSettings, 
    isLoading: isLoadingSettings,
    error: settingsError 
  } = useQuery<UserSettings>({
    queryKey: ["/api/user/settings"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Update user settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<UserSettings>) => {
      return await apiRequest("PUT", "/api/user/settings", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
    },
    onError: (error) => {
      console.error("Failed to update user settings:", error);
      toast({
        title: "Settings update failed",
        description: "Failed to save your tour progress. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Parse tour progress from user settings
  const tourProgress: TourProgress | null = userSettings?.tourProgress 
    ? (typeof userSettings.tourProgress === 'string' 
       ? JSON.parse(userSettings.tourProgress) 
       : userSettings.tourProgress)
    : null;

  const hasCompletedTour = userSettings?.hasCompletedTour || false;

  // Check if user should see tour prompt
  const shouldShowTourPrompt = !hasCompletedTour && 
                              !isTourActive && 
                              !tourProgress?.currentStepId &&
                              isAuthenticated &&
                              autoStartForNewUsers;

  // Check if tour can be resumed
  const canResumeTour = Boolean(!hasCompletedTour && 
                               tourProgress?.currentStepId && 
                               !isTourActive);

  // Start tour
  const startTour = useCallback(async (fromStep?: string) => {
    try {
      setIsTourActive(true);
      
      if (persistProgress) {
        const newProgress: TourProgress = {
          currentStepId: fromStep || 'welcome',
          completedSteps: fromStep ? [] : tourProgress?.completedSteps || [],
          skippedSteps: tourProgress?.skippedSteps || [],
          startedAt: tourProgress?.startedAt || new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        };

        await updateSettingsMutation.mutateAsync({
          tourProgress: newProgress,
          hasCompletedTour: false,
        });
      }

      toast({
        title: "Welcome to the tour! 🚀",
        description: "Let's explore your pharmacy management system together.",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to start tour:", error);
      setIsTourActive(false);
      toast({
        title: "Tour start failed",
        description: "Failed to start the tour. Please try again.",
        variant: "destructive",
      });
    }
  }, [persistProgress, tourProgress, updateSettingsMutation, toast]);

  // Complete tour
  const completeTour = useCallback(async () => {
    try {
      setIsTourActive(false);
      
      if (persistProgress) {
        await updateSettingsMutation.mutateAsync({
          hasCompletedTour: true,
          tourProgress: {
            ...tourProgress,
            currentStepId: undefined,
            lastActiveAt: new Date().toISOString(),
          },
        });
      }

      toast({
        title: "Tour completed! 🎉",
        description: "You've successfully completed the guided tour. Welcome to DeelRxCRM!",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to complete tour:", error);
      toast({
        title: "Tour completion failed",
        description: "Failed to save tour completion. Please try again.",
        variant: "destructive",
      });
    }
  }, [persistProgress, tourProgress, updateSettingsMutation, toast]);

  // Skip tour
  const skipTour = useCallback(async () => {
    try {
      setIsTourActive(false);
      
      if (persistProgress) {
        await updateSettingsMutation.mutateAsync({
          hasCompletedTour: true,
          tourProgress: {
            ...tourProgress,
            currentStepId: undefined,
            lastActiveAt: new Date().toISOString(),
            skippedSteps: [...(tourProgress?.skippedSteps || []), 'full-tour'],
          },
        });
      }

      toast({
        title: "Tour skipped",
        description: "You can restart the tour anytime from the Help menu.",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to skip tour:", error);
      toast({
        title: "Tour skip failed",
        description: "Failed to save tour preferences. Please try again.",
        variant: "destructive",
      });
    }
  }, [persistProgress, tourProgress, updateSettingsMutation, toast]);

  // Resume tour
  const resumeTour = useCallback(async () => {
    if (!canResumeTour || !tourProgress?.currentStepId) {
      return;
    }

    try {
      setIsTourActive(true);
      
      if (persistProgress) {
        await updateSettingsMutation.mutateAsync({
          tourProgress: {
            ...tourProgress,
            lastActiveAt: new Date().toISOString(),
          },
        });
      }

      toast({
        title: "Tour resumed",
        description: "Continuing from where you left off.",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to resume tour:", error);
      setIsTourActive(false);
      toast({
        title: "Tour resume failed",
        description: "Failed to resume the tour. Please try again.",
        variant: "destructive",
      });
    }
  }, [canResumeTour, tourProgress, persistProgress, updateSettingsMutation, toast]);

  // Update tour progress
  const updateTourProgress = useCallback(async (stepId: string, action: 'completed' | 'skipped') => {
    if (!persistProgress || !isTourActive) {
      return;
    }

    try {
      const currentProgress = tourProgress || {
        completedSteps: [],
        skippedSteps: [],
        startedAt: new Date().toISOString(),
      };

      const newProgress: TourProgress = {
        ...currentProgress,
        currentStepId: stepId,
        completedSteps: action === 'completed' 
          ? [...currentProgress.completedSteps.filter(id => id !== stepId), stepId]
          : currentProgress.completedSteps,
        skippedSteps: action === 'skipped'
          ? [...currentProgress.skippedSteps.filter(id => id !== stepId), stepId]
          : currentProgress.skippedSteps.filter(id => id !== stepId),
        lastActiveAt: new Date().toISOString(),
      };

      await updateSettingsMutation.mutateAsync({
        tourProgress: newProgress,
      });
    } catch (error) {
      console.error("Failed to update tour progress:", error);
      // Don't show toast for progress updates to avoid spam
    }
  }, [persistProgress, isTourActive, tourProgress, updateSettingsMutation]);

  // Reset tour
  const resetTour = useCallback(async () => {
    try {
      setIsTourActive(false);
      
      await updateSettingsMutation.mutateAsync({
        hasCompletedTour: false,
        tourProgress: null,
      });

      toast({
        title: "Tour reset",
        description: "Tour progress has been reset. You can start the tour again.",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to reset tour:", error);
      toast({
        title: "Tour reset failed",
        description: "Failed to reset tour progress. Please try again.",
        variant: "destructive",
      });
    }
  }, [updateSettingsMutation, toast]);

  // Update user settings
  const updateUserSettings = useCallback(async (settings: Partial<UserSettings>) => {
    try {
      await updateSettingsMutation.mutateAsync(settings);
      toast({
        title: "Settings updated",
        description: "Your preferences have been saved successfully.",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to update user settings:", error);
      throw error;
    }
  }, [updateSettingsMutation, toast]);

  // Auto-start tour for new users
  useEffect(() => {
    if (shouldShowTourPrompt && autoStartForNewUsers) {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        if (!isTourActive && !hasCompletedTour) {
          toast({
            title: "Welcome to DeelRxCRM! 👋",
            description: "Would you like to take a quick tour to get started? Click the Help menu to start the tour.",
            variant: "default",
          });
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [shouldShowTourPrompt, autoStartForNewUsers, isTourActive, hasCompletedTour, startTour, toast]);

  // Handle settings errors
  useEffect(() => {
    if (settingsError) {
      console.error("Failed to load user settings:", settingsError);
      toast({
        title: "Settings load failed",
        description: "Failed to load your preferences. Some features may not work correctly.",
        variant: "destructive",
      });
    }
  }, [settingsError, toast]);

  return {
    // Tour state
    isLoading: isLoadingSettings || updateSettingsMutation.isPending,
    isTourActive,
    hasCompletedTour,
    tourProgress,
    
    // User settings
    userSettings,
    
    // Tour controls
    startTour,
    completeTour,
    skipTour,
    resumeTour,
    updateTourProgress,
    resetTour,
    
    // Tour configuration
    shouldShowTourPrompt,
    canResumeTour,
    
    // Settings management
    updateUserSettings,
  };
}

export default useTour;