/**
 * useProfileSheets — visibility state for all bottom sheets on ProfileScreen.
 */
import { useState } from 'react';

export function useProfileSheets() {
  const [showEdit,           setShowEdit]           = useState(false);
  const [showPhotoPicker,    setShowPhotoPicker]    = useState(false);
  const [showEmojiPicker,    setShowEmojiPicker]    = useState(false);
  const [showNotifSheet,     setShowNotifSheet]     = useState(false);
  const [showProfilePrivacy, setShowProfilePrivacy] = useState(false);
  const [showPetPrivacy,     setShowPetPrivacy]     = useState(false);
  const [showFeedback,       setShowFeedback]       = useState(false);

  return {
    showEdit, setShowEdit,
    showPhotoPicker, setShowPhotoPicker,
    showEmojiPicker, setShowEmojiPicker,
    showNotifSheet, setShowNotifSheet,
    showProfilePrivacy, setShowProfilePrivacy,
    showPetPrivacy, setShowPetPrivacy,
    showFeedback, setShowFeedback,
  };
}
