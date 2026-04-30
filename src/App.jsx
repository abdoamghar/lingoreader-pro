import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, Upload, Volume2, X, Loader2, BookType, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MessageSquare, Languages, LayoutDashboard, LibraryBig, BookmarkPlus, ArrowLeftRight, Trash2 } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import axios from 'axios';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set worker path
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PROFILES = {
  abdelhamid: {
    name: 'Abdelhamid', avatar: '👨‍🏫',
    srcLang: 'en', targetLang: 'ar',
    langLabel: 'عربي', dir: 'rtl',
    speechLang: 'en-US',
    dictMode: 'english', // uses Free Dictionary API (English definitions)
    badgeText: 'English → عربي',
  },
  kawtar: {
    name: 'Kawtar', avatar: '👩‍💼',
    srcLang: 'fr', targetLang: 'ar',
    langLabel: 'عربي', dir: 'rtl',
    speechLang: 'fr-FR',
    dictMode: 'french', // uses Google Translate definitions (French)
    badgeText: 'Français → عربي',
  },
};

function ProfileScreen({ onSelect }) {
  return (
    <div className="profile-screen">
      <div className="profile-hero">
        <div className="profile-logo"><span>📖</span> LingoReader Pro</div>
        <h1>Who is reading today?</h1>
        <p>Choose your profile to personalize your learning experience.</p>
      </div>
      <div className="profile-cards">
        {Object.entries(PROFILES).map(([key, profile]) => (
          <button key={key} className="profile-card" onClick={() => onSelect(key)}>
            <div className="profile-avatar">{profile.avatar}</div>
            <h2>{profile.name}</h2>
            <span className="profile-lang-badge">{profile.badgeText}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [activeProfile, setActiveProfile] = useState(null);
  const fetchDefinitionRef = React.useRef(null);
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [scale, setScale] = useState(1.0);
  const [selectedWord, setSelectedWord] = useState('');
  const [dictData, setDictData] = useState(null);
  const [arabicTranslation, setArabicTranslation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectionData, setSelectionData] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [pdfWidth, setPdfWidth] = useState(Math.min(window.innerWidth - 40, 800));
  
  // Handle Resize for PDF width
  useEffect(() => {
    const handleResize = () => setPdfWidth(Math.min(window.innerWidth - 40, 800));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // New Features State
  const [currentView, setCurrentView] = useState('reader'); // 'reader', 'vault', 'analytics'
  const [sentenceTranslation, setSentenceTranslation] = useState('');
  const [isTranslatingSentence, setIsTranslatingSentence] = useState(false);
  const [vaultSaved, setVaultSaved] = useState(false);
  const [activeDeletePopup, setActiveDeletePopup] = useState(null);
  const [alternativeTranslations, setAlternativeTranslations] = useState([]);
  
  const [savedWords, setSavedWords] = useState(() => {
    const saved = localStorage.getItem('lingoVault');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('lingoStats');
    return saved ? JSON.parse(saved) : { words: 0, sentences: 0, pagesRead: 0 };
  });

  useEffect(() => { localStorage.setItem('lingoVault', JSON.stringify(savedWords)); }, [savedWords]);
  useEffect(() => { localStorage.setItem('lingoStats', JSON.stringify(stats)); }, [stats]);
  
  // Notes State
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('lingoNotes');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('lingoNotes', JSON.stringify(notes));
  }, [notes]);

  // Sync page input with page number
  useEffect(() => {
    setPageInput(pageNumber.toString());
  }, [pageNumber]);

  // Save page progress & Load Highlights
  useEffect(() => {
    if (file && pageNumber) {
      const fileKey = `lingo_pdf_${file.name}_${file.size}`;
      localStorage.setItem(fileKey, pageNumber.toString());
      // Close toolbars on page change
      setSelectionData(null);
      setActiveDeletePopup(null);
    }
  }, [file, pageNumber]);

  useEffect(() => {
    if (file) {
      const hlKey = `lingo_hl_${file.name}_${file.size}`;
      const savedHl = localStorage.getItem(hlKey);
      setHighlights(savedHl ? JSON.parse(savedHl) : []);
    }
  }, [file]);

  useEffect(() => {
    if (file) {
      const hlKey = `lingo_hl_${file.name}_${file.size}`;
      localStorage.setItem(hlKey, JSON.stringify(highlights));
    }
  }, [highlights, file]);

  const handlePageSubmit = (e) => {
    e.preventDefault();
    const newPage = parseInt(pageInput, 10);
    if (newPage >= 1 && newPage <= numPages) {
      setPageNumber(newPage);
    } else {
      setPageInput(pageNumber.toString());
    }
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  // File Upload Handler
  const onFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const fileKey = `lingo_pdf_${selectedFile.name}_${selectedFile.size}`;
      const savedPage = localStorage.getItem(fileKey);
      setPageNumber(savedPage ? parseInt(savedPage, 10) : 1);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  // Highlight notes by manipulating the DOM directly
  const highlightNotes = useCallback(() => {
    const spans = document.querySelectorAll('.react-pdf__Page__textContent span');
    if (!spans || spans.length === 0) return;
    
    // Sort by length descending to match longest phrases first
    // Get normalized keys
    const wordsWithNotes = Object.keys(notes)
      .filter(word => notes[word] && notes[word].trim() !== '')
      .sort((a, b) => b.length - a.length);

    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Use Unicode property escapes (\p{L}) for word boundaries that support French accents
    // This looks for word starts/ends that are NOT letters (including accented ones)
    const pattern = wordsWithNotes.length > 0 
      ? new RegExp(`(?<!\\p{L})(${wordsWithNotes.map(escapeRegExp).join('|')})(?!\\p{L})`, 'giu')
      : null;

    spans.forEach(span => {
      const text = span.textContent;
      
      if (!pattern) {
        if (span.innerHTML !== text) span.innerHTML = text;
        return;
      }
      
      const newHTML = text.replace(pattern, (match) => {
        const wordKey = match.toLowerCase().normalize('NFC');
        const comment = notes[wordKey] || '';
        const safeComment = comment.replace(/"/g, '&quot;');
        return `<mark class="note-highlight" data-tooltip="${safeComment}">${match}</mark>`;
      });

      if (span.innerHTML !== newHTML) {
        span.innerHTML = newHTML;
      }
    });
  }, [notes]);

  // Run highlighting when notes, scale, or page changes, and after render
  useEffect(() => {
    const timeoutId = setTimeout(highlightNotes, 100);
    return () => clearTimeout(timeoutId);
  }, [highlightNotes, notes, scale, pageNumber]);

  // Text Selection Handler
  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text) {
      // 1. Single word dictionary lookup
      if (!text.includes(' ') && text.length > 1) {
        const cleanWord = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        if (cleanWord.toLowerCase() !== selectedWord.toLowerCase()) {
          setSelectedWord(cleanWord);
          fetchDefinitionRef.current?.(cleanWord);
        }
      }

      // 2. Highlighting Coordinates for ALL selections
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects());
        const boundingBox = range.getBoundingClientRect();
        
        const pageWrapper = document.querySelector('.react-pdf__Page');
        if (pageWrapper) {
          const pageRect = pageWrapper.getBoundingClientRect();
          
          // Normalize to base scale (1.0)
          const normalizedRects = rects.map(rect => ({
            left: (rect.left - pageRect.left) / scale,
            top: (rect.top - pageRect.top) / scale,
            width: rect.width / scale,
            height: rect.height / scale,
          }));
          
          setSelectionData({
            text,
            rects: normalizedRects,
            page: pageNumber,
            toolbarPos: {
              top: boundingBox.top - 45,
              left: boundingBox.left + (boundingBox.width / 2)
            },
            isExisting: highlights.some(h => h.page === pageNumber && h.text === text)
          });
        }
      }
    } else {
      setSelectionData(null);
    }
  }, [selectedWord, scale, pageNumber]);

  const addHighlight = (color) => {
    if (selectionData) {
      setHighlights(prev => [...prev, {
        id: Date.now(),
        page: selectionData.page,
        rects: selectionData.rects,
        color,
        text: selectionData.text
      }]);
      setSelectionData(null);
      window.getSelection().removeAllRanges();
    }
  };

  const deleteHighlightAtSelection = () => {
    if (selectionData) {
      setHighlights(prev => prev.filter(h => !(h.page === selectionData.page && h.text === selectionData.text)));
      setSelectionData(null);
      window.getSelection().removeAllRanges();
    }
  };

  const removeHighlight = (id) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const translateSentence = async () => {
    if (!selectionData) return;
    const text = selectionData.text;
    setPanelOpen(true);
    setDictData(null);
    setSentenceTranslation('');
    setIsTranslatingSentence(true);
    
    try {
      const sl = activeProfile ? PROFILES[activeProfile].srcLang : 'en';
      const tl = activeProfile ? PROFILES[activeProfile].targetLang : 'ar';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await axios.get(url);
      
      // Google Translate returns an array of arrays for sentences. We join them.
      let fullTranslation = '';
      if (res.data && res.data[0]) {
        fullTranslation = res.data[0].map(item => item[0]).join('');
      }
      
      setSentenceTranslation(fullTranslation || 'Translation not found.');
      setStats(prev => ({ ...prev, sentences: prev.sentences + 1 }));
    } catch (err) {
      setSentenceTranslation("Failed to translate sentence. Please try again.");
    } finally {
      setIsTranslatingSentence(false);
      setSelectionData(null);
      window.getSelection().removeAllRanges();
    }
  };

  const saveToVault = () => {
    if (dictData && !vaultSaved) {
      // Duplicate protection
      const alreadySaved = savedWords.some(
        w => w.word.toLowerCase() === dictData.word.toLowerCase()
      );
      if (alreadySaved) {
        setVaultSaved(true);
        setTimeout(() => setVaultSaved(false), 2000);
        return;
      }
      const wordObj = {
        id: Date.now(),
        word: dictData.word,
        translation: arabicTranslation,
        phonetic: dictData.phonetic || (dictData.phonetics && dictData.phonetics[0]?.text),
        definition: dictData.meanings[0]?.definitions[0]?.definition,
        note: notes[dictData.word.toLowerCase().normalize('NFC')] || ''
      };
      setSavedWords(prev => [...prev, wordObj]);
      setVaultSaved(true);
      setTimeout(() => setVaultSaved(false), 2000);
    }
  };

  const exportNotes = () => {
    const wordList = savedWords.map(w => `
      <tr>
        <td style="padding:10px 14px;font-weight:700;font-size:1.1rem">${w.word}</td>
        <td style="padding:10px 14px;color:#6366f1">${w.phonetic || ''}</td>
        <td style="padding:10px 14px;direction:rtl;font-size:1.1rem;color:#10b981">${w.translation || ''}</td>
        <td style="padding:10px 14px;color:#555">${w.definition || ''}</td>
        <td style="padding:10px 14px;color:#888;font-style:italic">${w.note || ''}</td>
      </tr>
    `).join('');

    const noteList = Object.entries(notes)
      .filter(([, v]) => v)
      .map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`)
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>LingoReader Pro — Study Sheet</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 2rem; }
    h1 { color: #6366f1; font-size: 2rem; border-bottom: 3px solid #6366f1; padding-bottom: 0.5rem; }
    h2 { color: #475569; margin-top: 2rem; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    thead { background: #6366f1; color: white; }
    thead th { padding: 12px 14px; text-align: left; font-weight: 600; }
    tbody tr:nth-child(even) { background: #f1f5f9; }
    ul { background: white; padding: 1.5rem 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    li { margin-bottom: 0.5rem; }
    .footer { margin-top: 3rem; color: #94a3b8; font-size: 0.85rem; text-align: center; }
  </style>
</head>
<body>
  <h1>📖 LingoReader Pro — Study Sheet</h1>
  <p>Generated on ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })} &nbsp;|&nbsp; Profile: ${profile.name}</p>
  <h2>📚 Vocabulary Vault (${savedWords.length} words)</h2>
  <table>
    <thead><tr><th>Word</th><th>Phonetic</th><th>Translation</th><th>Definition</th><th>My Note</th></tr></thead>
    <tbody>${wordList}</tbody>
  </table>
  ${noteList ? `<h2>🗒️ All My Notes</h2><ul>${noteList}</ul>` : ''}
  <div class="footer">LingoReader Pro &mdash; Your personal English learning companion</div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LingoReader_StudySheet_${profile.name}_${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, [handleSelection]);

  // Close popups on click elsewhere
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('.highlight-rect') && !e.target.closest('.delete-popup')) {
        setActiveDeletePopup(null);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      // Ignore when typing in inputs/textareas
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setPageNumber(prev => Math.min(prev + 1, numPages || 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setPageNumber(prev => Math.max(prev - 1, 1));
      } else if (e.key === '=' || e.key === '+') {
        setScale(prev => Math.min(prev + 0.2, 3.0));
      } else if (e.key === '-') {
        setScale(prev => Math.max(prev - 0.2, 0.5));
      } else if (e.key === 'Escape') {
        setSelectionData(null);
        setPanelOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [numPages]);

  // Helper to find phonetic transliteration in Google Translate's response
  const findPhonetic = (obj, originalWord) => {
    if (!obj || !obj[0]) return '';
    // Look in the first and second indices of the sentence array
    // Google usually puts romanization at index 3 of the first segment or index 2 of the second segment
    let p = '';
    if (obj[0][0]) p = obj[0][0][3];
    if (!p && obj[0][1]) p = obj[0][1][3] || obj[0][1][2];
    
    if (p && typeof p === 'string' && p.toLowerCase() !== originalWord?.toLowerCase()) {
      return p;
    }
    return '';
  };

  // Fetch from APIs
  const fetchDefinition = async (word) => {
    setLoading(true);
    setError(null);
    setPanelOpen(true);
    setDictData(null);
    setSentenceTranslation('');
    setArabicTranslation('');
    setAlternativeTranslations([]);
    setVaultSaved(false);

    const getTransUrl = (q, sl, tl, dts = ['t']) => {
      const dtParams = dts.map(d => `dt=${d}`).join('&');
      return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&${dtParams}&q=${encodeURIComponent(q)}`;
    };

    try {
      const sl = activeProfile ? PROFILES[activeProfile].srcLang : 'en';
      const tl = activeProfile ? PROFILES[activeProfile].targetLang : 'ar';
      const isFrenchMode = activeProfile && PROFILES[activeProfile].dictMode === 'french';
      
      const transUrl = getTransUrl(word, sl, tl, ['t', 'rm']);
      
      // Perform translation and initial dictionary check
      const [dictResponse, transResponse] = await Promise.all([
        !isFrenchMode ? axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`).catch(() => null) : Promise.resolve(null),
        axios.get(transUrl).catch(() => null)
      ]);
      
      // Handle English mode (Abdelhamid)
      if (!isFrenchMode) {
        if (dictResponse && dictResponse.data) {
          setDictData(dictResponse.data[0]);
          setStats(prev => ({ ...prev, words: prev.words + 1 }));
        } else {
          setDictData({ word, meanings: [], phonetics: [] });
        }
      }

      // Handle translation (Arabic result)
      if (transResponse && transResponse.data) {
        if (transResponse.data[0]) {
          const translatedText = transResponse.data[0].map(item => item[0]).join('');
          setArabicTranslation(translatedText);
        }
        
        // Extract Alternative Translations (contextual meanings)
        // Usually in index 1 or 5 for Google Translate
        const rawAlts = transResponse.data[1] || transResponse.data[5];
        if (rawAlts && Array.isArray(rawAlts)) {
          const alts = rawAlts.flatMap(entry => {
            if (Array.isArray(entry) && Array.isArray(entry[1])) {
              return entry[1];
            }
            return [];
          }).slice(0, 8); // Top 8 alternatives
          setAlternativeTranslations([...new Set(alts)]); // Unique values
        }
      }

      // For Kawtar (French mode): fetch French definitions from Google Translate
      if (isFrenchMode) {
        try {
          // dt=d: definitions, dt=md: definitions, dt=ss: synonyms, dt=t: translation, dt=at: alternative translations, dt=rm: transliteration/phonetic
          const defUrl = getTransUrl(word, 'fr', 'en', ['d', 'md', 'ss', 'at']);
          const phoneticUrl = getTransUrl(word, 'fr', 'en', ['t', 'rm']);
          
          const [defRes, phoneticRes] = await Promise.all([
            axios.get(defUrl).catch(() => null),
            axios.get(phoneticUrl).catch(() => null)
          ]);
          
          // Definitions are usually in index 1 or 12
          const rawDefs = (defRes?.data && (defRes.data[1] || defRes.data[12]));
          // Synonyms are usually in index 11
          const rawSyns = (defRes?.data && defRes.data[11]);
          // Phonetic/Romanization is more reliable in a dedicated 't+rm' call
          let phonetic = findPhonetic(phoneticRes?.data, word);
          
          if (rawDefs && Array.isArray(rawDefs)) {
            const meanings = rawDefs.map(entry => {
              const partOfSpeech = entry[0];
              const definitions = (entry[1] || []).map(d => ({
                definition: d[0],
                example: d[2] || ''
              }));
              
              let synonyms = [];
              if (rawSyns && Array.isArray(rawSyns)) {
                const synEntry = rawSyns.find(s => s[0] === partOfSpeech);
                if (synEntry && synEntry[1]) {
                  synonyms = synEntry[1].flatMap(s => s[0] || []);
                }
              }
              
              return { partOfSpeech, definitions, synonyms };
            });
            setDictData({ word, meanings, phonetics: [], phonetic });
          } else {
            setDictData({ word, meanings: [], phonetics: [], phonetic });
          }
          setStats(prev => ({ ...prev, words: prev.words + 1 }));
        } catch (e) {
          console.error("French dict fetch error:", e);
          setDictData({ word, meanings: [], phonetics: [], phonetic: '' });
        }
      }

      if (!isFrenchMode && (!dictResponse || !dictResponse.data) && !transResponse) {
        setError('Translation not found. Try another word.');
      } else if (isFrenchMode && !transResponse) {
        setError('Translation not found. Try another word.');
      }
    } catch (err) {
      setError("Error fetching details. Try another word.");
    } finally {
      setLoading(false);
    }
  };

  // Keep fetchDefinitionRef in sync
  React.useEffect(() => {
    fetchDefinitionRef.current = fetchDefinition;
  });

  // Audio Playback
  const playAudio = () => {
    if (dictData && dictData.phonetics) {
      const audioUrl = dictData.phonetics.find(p => p.audio)?.audio;
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play();
      } else {
        // Fallback to Web Speech API
        speakWord(dictData.word);
      }
    } else if (selectedWord) {
      speakWord(selectedWord);
    }
  };

  const speakWord = (word) => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = activeProfile ? PROFILES[activeProfile].speechLang : 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  if (!activeProfile) return <ProfileScreen onSelect={setActiveProfile} />;

  const profile = PROFILES[activeProfile];

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-title">
          <BookOpen size={28} color="var(--primary)" />
          <span>LingoReader Pro</span>
        </div>
        <div className="header-profile">
          <span className="profile-chip">{profile.avatar} {profile.name}</span>
          <button className="switch-profile-btn" onClick={() => setActiveProfile(null)}>Switch Profile</button>
        </div>
        
        <div className="view-nav">
          <button className={`nav-tab ${currentView === 'reader' ? 'active' : ''}`} onClick={() => setCurrentView('reader')}>
            <BookType size={18} /> Reader
          </button>
          <button className={`nav-tab ${currentView === 'vault' ? 'active' : ''}`} onClick={() => setCurrentView('vault')}>
            <LibraryBig size={18} /> Vocab Vault
          </button>
          <button className={`nav-tab ${currentView === 'analytics' ? 'active' : ''}`} onClick={() => setCurrentView('analytics')}>
            <LayoutDashboard size={18} /> Analytics
          </button>
        </div>

        <div className="header-actions">
          <button className="export-btn" onClick={exportNotes} title="Export Study Sheet">
            ⬇ Export Notes
          </button>
          <label className="upload-btn">
            <Upload size={20} />
            Upload PDF
            <input 
              type="file" 
              accept="application/pdf" 
              onChange={onFileChange} 
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </header>

      <main className="main-content">
        {currentView === 'reader' && (
          <>
            {/* Floating Highlight Toolbar */}
            {selectionData && (
              <div 
                className="floating-toolbar"
                style={{
                  top: `${selectionData.toolbarPos.top}px`,
                  left: `${selectionData.toolbarPos.left}px`
                }}
              >
                <button className="color-btn yellow" onClick={() => addHighlight('yellow')} />
                <button className="color-btn green" onClick={() => addHighlight('green')} />
                <button className="color-btn pink" onClick={() => addHighlight('pink')} />
                <div className="toolbar-divider" />
                <button className="toolbar-action-btn" onClick={translateSentence} title="Translate Sentence">
                  <Languages size={18} />
                </button>
                {selectionData.isExisting && (
                  <>
                    <div className="toolbar-divider" />
                    <button className="toolbar-action-btn" onClick={deleteHighlightAtSelection} title="Remove Highlight" style={{ color: '#ef4444' }}>
                      <X size={18} />
                    </button>
                  </>
                )}
              </div>
            )}
            
            {/* Delete Popup */}
            {activeDeletePopup && (
              <div 
                className="delete-popup"
                style={{
                  position: 'fixed',
                  top: `${activeDeletePopup.y}px`,
                  left: `${activeDeletePopup.x}px`,
                  transform: 'translate(-50%, -100%)',
                  zIndex: 2000
                }}
              >
                <button 
                  className="delete-confirm-btn"
                  onClick={() => {
                    removeHighlight(activeDeletePopup.id);
                    setActiveDeletePopup(null);
                  }}
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            )}

            <div className="pdf-viewer-area">
              <div className="pdf-container">
                {!file ? (
                  <div className="empty-state">
                    <BookType size={64} />
                    <h2>No PDF selected</h2>
                    <p>Upload a PDF book or document to start reading. Select any word to instantly translate and hear its pronunciation.</p>
                  </div>
                ) : (
                  <div className="pdf-document">
                    <Document
                      file={file}
                      onLoadSuccess={onDocumentLoadSuccess}
                      loading={
                        <div className="loading-state">
                          <Loader2 className="spinner" size={40} />
                          <p>Loading document...</p>
                        </div>
                      }
                    >
                      <div className="pdf-page-wrapper" style={{ position: 'relative' }}>
                        <Page
                          pageNumber={pageNumber}
                          scale={scale}
                          renderTextLayer={true}
                          renderAnnotationLayer={false}
                          onRenderTextLayerSuccess={highlightNotes}
                          width={pdfWidth}
                        />
                        {/* Manual Highlights Overlay */}
                        <div className="highlights-layer">
                          {highlights.filter(h => h.page === pageNumber).map(highlight => (
                            <React.Fragment key={highlight.id}>
                              {highlight.rects.map((rect, i) => (
                                <div
                                  key={i}
                                  className={`highlight-rect bg-${highlight.color}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.target.getBoundingClientRect();
                                    setActiveDeletePopup({
                                      id: highlight.id,
                                      x: rect.left + rect.width / 2,
                                      y: rect.top - 10
                                    });
                                  }}
                                  style={{
                                    left: `${rect.left * scale}px`,
                                    top: `${rect.top * scale}px`,
                                    width: `${rect.width * scale}px`,
                                    height: `${rect.height * scale}px`,
                                    pointerEvents: 'all',
                                    cursor: 'pointer',
                                  }}
                                />
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </Document>
                  </div>
                )}
              </div>

              {/* Bottom Toolbar — Zoom & Pagination */}
              {numPages && (
                <div className="pdf-toolbar">
                  <button className="toolbar-btn" disabled={scale <= 0.5} onClick={zoomOut} title="Zoom Out">
                    <ZoomOut size={20} />
                  </button>
                  <span className="page-info">{Math.round(scale * 100)}%</span>
                  <button className="toolbar-btn" disabled={scale >= 3.0} onClick={zoomIn} title="Zoom In">
                    <ZoomIn size={20} />
                  </button>

                  <div className="toolbar-divider"></div>

                  <button className="toolbar-btn" disabled={pageNumber <= 1} onClick={() => setPageNumber(prev => prev - 1)}>
                    <ChevronLeft size={24} />
                  </button>
                  <form onSubmit={handlePageSubmit} className="page-form">
                    <input
                      type="number"
                      className="page-input"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onBlur={handlePageSubmit}
                      min="1"
                      max={numPages}
                    />
                    <span>/ {numPages}</span>
                  </form>
                  <button className="toolbar-btn" disabled={pageNumber >= numPages} onClick={() => setPageNumber(prev => prev + 1)}>
                    <ChevronRight size={24} />
                  </button>
                </div>
              )}
            </div>

            {/* Translation Side Panel */}
            <aside className={`translator-panel ${panelOpen ? '' : 'hidden'}`}>
          <div className="panel-header">
            <div className="panel-title">
              <BookType size={20} />
              Translation
            </div>
            <button className="close-btn" onClick={() => setPanelOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="panel-content">
            {isTranslatingSentence ? (
              <div className="loading-state">
                <Loader2 className="spinner" size={40} />
                <p>Translating sentence...</p>
              </div>
            ) : sentenceTranslation ? (
              <div className="sentence-translation-view">
                <h3 className="section-title">Arabic Translation</h3>
                <p className="arabic-text" dir={profile.dir}>{sentenceTranslation}</p>
              </div>
            ) : !selectedWord ? (
              <div className="empty-selection">
                <BookOpen size={48} style={{ opacity: 0.3 }} />
                <p>Select any word in the PDF to see its definition and hear its pronunciation.</p>
              </div>
            ) : loading ? (
              <div className="loading-state">
                <Loader2 size={40} className="spinner" />
                <p>Looking up "{selectedWord}"...</p>
              </div>
            ) : error ? (
              <div className="error-state">
                <X size={48} style={{ color: '#ef4444' }} />
                <p>{error}</p>
                <button className="upload-btn" onClick={() => speakWord(selectedWord)} style={{ marginTop: '1rem' }}>
                  <Volume2 size={16} /> Just Pronounce
                </button>
              </div>
            ) : dictData ? (
              <div className="dictionary-result">
                <div className="word-header">
                  <h1 className="selected-word">{dictData.word}</h1>
                  {arabicTranslation && (
                    <div className="translation-group">
                      <h2 className="arabic-translation" style={{ fontSize: '1.8rem', color: '#10b981', marginBottom: '0.25rem', fontFamily: 'Arial, sans-serif' }} dir={profile.dir}>
                        {arabicTranslation}
                      </h2>
                      {alternativeTranslations.length > 0 && (
                        <div className="alternative-translations" dir={profile.dir}>
                          {alternativeTranslations.map((alt, i) => (
                            <span key={i} className="alt-tag">{alt}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="phonetic-row">
                    <span className="phonetic">{dictData.phonetic || (dictData.phonetics && dictData.phonetics[0]?.text)}</span>
                    <button className="play-btn" onClick={playAudio} title="Hear pronunciation">
                      <Volume2 size={20} />
                    </button>
                  </div>
                </div>

                <div className="note-section">
                  <div className="note-header">
                    <MessageSquare size={16} />
                    <span>My Comment</span>
                  </div>
                  <textarea 
                    className="note-input"
                    placeholder="Add a comment for this word to highlight it in the text..."
                    value={notes[dictData.word.toLowerCase().normalize('NFC')] || ''}
                    onChange={(e) => setNotes({ ...notes, [dictData.word.toLowerCase().normalize('NFC')]: e.target.value })}
                  />
                  <button className="save-btn" onClick={saveToVault} disabled={vaultSaved}>
                    {vaultSaved
                      ? savedWords.some(w => w.word.toLowerCase() === dictData?.word.toLowerCase())
                        ? '✓ Already in Vault'
                        : '✓ Saved to Vault!'
                      : 'Add to Vault'
                    }
                  </button>
                </div>

                {dictData.meanings.map((meaning, idx) => (
                  <div key={idx} className="meaning-section">
                    <div className="part-of-speech">{meaning.partOfSpeech}</div>
                    {meaning.definitions.slice(0, 2).map((def, defIdx) => (
                      <div key={defIdx}>
                        <p className="definition">{defIdx + 1}. {def.definition}</p>
                        {def.example && <p className="example">"{def.example}"</p>}
                      </div>
                    ))}
                    
                    {meaning.synonyms && meaning.synonyms.length > 0 && (
                      <div className="synonyms">
                        {meaning.synonyms.slice(0, 5).map((syn, synIdx) => (
                          <span key={synIdx} className="synonym-tag">{syn}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
        </>
        )}
        
        {currentView === 'vault' && (
          <div className="vault-view">
            <h1 className="view-heading"><LibraryBig size={28} /> Vocabulary Vault</h1>
            {savedWords.length === 0 ? (
              <div className="empty-state">
                <BookmarkPlus size={48} />
                <p>Your vault is empty. Save words from the reader to review them here.</p>
              </div>
            ) : (
              <div className="flashcards-grid">
                {savedWords.map(word => (
                  <div key={word.id} className="flashcard">
                    <div className="card-front">
                      <h3>{word.word}</h3>
                      <span className="phonetic">{word.phonetic}</span>
                      <ArrowLeftRight size={24} className="flip-icon" />
                    </div>
                    <div className="card-back">
                      <h3 dir="rtl" className="arabic-translation">{word.translation}</h3>
                      {word.definition && <p className="definition">{word.definition}</p>}
                      {word.note && (
                        <div className="card-note">
                          <MessageSquare size={14} />
                          <span>{word.note}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'analytics' && (
          <div className="analytics-view">
            <h1 className="view-heading"><LayoutDashboard size={28} /> Reading Analytics</h1>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.words}</div>
                <div className="stat-label">Words Translated</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.sentences}</div>
                <div className="stat-label">Sentences Translated</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{savedWords.length}</div>
                <div className="stat-label">Words in Vault</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Object.keys(notes).filter(k => notes[k]).length}</div>
                <div className="stat-label">Personal Notes Added</div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
