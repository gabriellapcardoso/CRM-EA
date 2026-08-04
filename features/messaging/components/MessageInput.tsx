'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
// lamejs is loaded as a global script (/lame.min.js) to avoid Turbopack CJS interop issues.
// See: app/(protected)/layout.tsx — <Script src="/lame.min.js" />
declare global {
  var lamejs: { Mp3Encoder: new (channels: number, sampleRate: number, bitRate: number) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }};
}
import { Send, Paperclip, Smile, Clock, FileText, X, Image, File as FileIcon, Mic, Square, Reply } from 'lucide-react';
import dynamic from 'next/dynamic';
import { type EmojiClickData, Theme } from 'emoji-picker-react';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => <div className="w-[320px] h-[400px] animate-pulse bg-slate-800 rounded-xl" />,
});
import { cn } from '@/lib/utils';
import { useSendTextMessage, useSendMessage } from '@/lib/query/hooks/useMessagingMessagesQuery';
import { useAssignConversation } from '@/lib/query/hooks/useConversationsQuery';
import { useAuth } from '@/context/AuthContext';
import { useMediaUploadMutation } from '@/lib/query/hooks/useMediaUploadMutation';
import {
  useApprovedTemplatesQuery,
  useSendTemplateMutation,
} from '@/lib/query/hooks/useTemplatesQuery';
import { TemplateSelector, type TemplateData } from './TemplateSelector';
import { ChannelIndicator } from './ChannelIndicator';
import { WindowExpiryBadge } from './WindowExpiryBadge';
import type { ConversationView, MessageContent, MessagingMessage } from '@/lib/messaging/types';

interface MessageInputProps {
  conversation: ConversationView;
  replyTo?: MessagingMessage | null;
  onCancelReply?: () => void;
}

interface PendingMedia {
  file: File;
  preview: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'document';
}

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/3gpp',
  'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
].join(',');

function getMediaType(mimeType: string): PendingMedia['mediaType'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Convert a WebM/Opus blob (Chrome MediaRecorder output) to an MP3 file.
 * Uses AudioContext to decode PCM + lamejs to encode to MP3.
 * WhatsApp Cloud API accepts audio/mpeg; Chrome never produces it natively.
 */
async function convertWebmToMp3(webmBlob: Blob): Promise<File> {
  const Mp3Encoder = window.lamejs?.Mp3Encoder;
  if (!Mp3Encoder) throw new Error('lamejs not loaded — /lame.min.js missing');

  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioContext = new AudioContext();

  // decodeAudioData can hang indefinitely in Chrome on malformed WebM —
  // wrap with a 15s timeout to guarantee resolution.
  const audioBuffer = await Promise.race([
    new Promise<AudioBuffer>((resolve, reject) =>
      audioContext.decodeAudioData(arrayBuffer, resolve, reject)
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('decodeAudioData timeout')), 15_000)
    ),
  ]);

  await audioContext.close();

  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  // 96 kbps — good quality/size tradeoff for voice messages
  const encoder = new Mp3Encoder(channels >= 2 ? 2 : 1, sampleRate, 96);

  const BLOCK_SIZE = 1152; // lamejs required block size

  const leftPCM = floatToInt16(audioBuffer.getChannelData(0));
  const rightPCM = channels >= 2 ? floatToInt16(audioBuffer.getChannelData(1)) : null;

  const mp3Chunks: Int8Array[] = [];

  for (let i = 0; i < leftPCM.length; i += BLOCK_SIZE) {
    const leftChunk = leftPCM.subarray(i, i + BLOCK_SIZE);
    const encoded = rightPCM
      ? encoder.encodeBuffer(leftChunk, rightPCM.subarray(i, i + BLOCK_SIZE))
      : encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) mp3Chunks.push(encoded);
  }

  const finalBlock = encoder.flush();
  if (finalBlock.length > 0) mp3Chunks.push(finalBlock);

  const mp3Blob = new Blob(mp3Chunks as BlobPart[], { type: 'audio/mpeg' });
  return new File([mp3Blob], `audio-${Date.now()}.mp3`, { type: 'audio/mpeg' });
}

function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function MessageInput({ conversation, replyTo, onCancelReply }: MessageInputProps) {
  const [text, setText] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { profile } = useAuth();
  const { mutate: sendTextMessage } = useSendTextMessage();
  const sendMessage = useSendMessage();
  const uploadMedia = useMediaUploadMutation();
  const { mutate: sendTemplate, isPending: isSendingTemplate } = useSendTemplateMutation();
  const { mutate: assignConversation } = useAssignConversation();

  // Claim (or sequester) conversation on send: assign to current user regardless of
  // current assignee. If already mine, this is a no-op on the DB.
  const claimConversation = useCallback(() => {
    if (!profile?.id) return;
    if (conversation.assignedUserId === profile.id) return;
    assignConversation({ conversationId: conversation.id, userId: profile.id });
  }, [profile?.id, conversation.assignedUserId, conversation.id, assignConversation]);
  const { data: templates = [], isLoading: isLoadingTemplates } = useApprovedTemplatesQuery(
    conversation.channelId
  );

  const isUploading = uploadMedia.isPending;
  // Text sends use optimistic updates — no need to block the input while the API is in flight.
  // Only block during: media upload (can't parallelize), template send, expired window.
  const isDisabled = conversation.isWindowExpired || isSendingTemplate || isUploading;
  // Show mic button when input is empty, no pending media, and not recording
  const showMicButton = !text.trim() && !pendingMedia && !isDisabled;

  // Cleanup blob URL on unmount to prevent memory leaks (FIX-03)
  // Also used by clearMedia to avoid depending on the entire pendingMedia object.
  const pendingMediaRef = useRef(pendingMedia);
  useEffect(() => { pendingMediaRef.current = pendingMedia; }, [pendingMedia]);
  useEffect(() => {
    return () => {
      if (pendingMediaRef.current?.preview) {
        URL.revokeObjectURL(pendingMediaRef.current.preview);
      }
    };
  }, []);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? text.length;
      const end = textarea.selectionEnd ?? text.length;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      setText(newText);
      requestAnimationFrame(() => {
        textarea.selectionStart = start + emoji.length;
        textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      });
    } else {
      setText(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
  }, [text]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mediaType = getMediaType(file.type);
    const preview = mediaType === 'image' ? URL.createObjectURL(file) : null;

    setPendingMedia({ file, preview, mediaType });

    // Reset input so same file can be selected again
    e.target.value = '';
  }, []);

  // Stable callback — reads latest pendingMedia via ref, no dep on the state value.
  const clearMedia = useCallback(() => {
    if (pendingMediaRef.current?.preview) {
      URL.revokeObjectURL(pendingMediaRef.current.preview);
    }
    setPendingMedia(null);
  }, []);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stream?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Prefer formats WhatsApp accepts natively (no conversion needed):
      //   1. audio/ogg;codecs=opus  — Firefox
      //   2. audio/mp4              — macOS/iOS Chrome (AAC) ← fixes Chrome on macOS
      //   3. audio/webm             — Windows Chrome fallback (needs conversion)
      const PREFERRED_TYPES = [
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/webm;codecs=opus',
        'audio/webm',
      ];
      const mimeType = PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      // User denied microphone or device unavailable — fail silently
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    recorder.onstop = async () => {
      recorder.stream?.getTracks().forEach((t) => t.stop());
      setIsRecording(false);

      const baseMimeType = recorder.mimeType.split(';')[0];
      const isWhatsAppNative = baseMimeType === 'audio/ogg'
        || baseMimeType === 'audio/mp4'
        || baseMimeType === 'audio/mpeg'
        || baseMimeType === 'audio/aac'
        || baseMimeType === 'audio/amr';

      if (isWhatsAppNative) {
        // Format already accepted by WhatsApp — no conversion needed
        const MIME_TO_EXT: Record<string, string> = {
          'audio/ogg': 'ogg',
          'audio/mp4': 'm4a',
          'audio/mpeg': 'mp3',
          'audio/aac': 'aac',
          'audio/amr': 'amr',
        };
        const ext = MIME_TO_EXT[baseMimeType] ?? 'audio';
        const file = new File(
          audioChunksRef.current,
          `audio-${Date.now()}.${ext}`,
          { type: baseMimeType }
        );
        setPendingMedia({ file, preview: null, mediaType: 'audio' });
        setRecordingDuration(0);
        audioChunksRef.current = [];
        return;
      }

      // audio/webm (Windows Chrome) — try MP3 conversion via lamejs
      setIsConverting(true);
      try {
        const rawBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        const mp3File = await convertWebmToMp3(rawBlob);
        setPendingMedia({ file: mp3File, preview: null, mediaType: 'audio' });
      } catch (err) {
        console.error('[Audio] MP3 conversion failed:', err);
        // webm not accepted by WhatsApp — clear media rather than send a broken file
        setPendingMedia(null);
      } finally {
        setIsConverting(false);
        setRecordingDuration(0);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        recorder.stream?.getTracks().forEach((t) => t.stop());
      };
      recorder.stop();
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSendMedia = useCallback(async () => {
    if (!pendingMedia || isDisabled) return;

    uploadMedia.mutate(
      { file: pendingMedia.file, conversationId: conversation.id },
      {
        onSuccess: (result) => {
          const content: MessageContent = {
            type: result.mediaType,
            mediaUrl: result.mediaUrl,
            mimeType: result.mimeType,
            fileName: result.fileName,
            fileSize: result.fileSize,
            ...(text.trim() ? { caption: text.trim() } : {}),
          } as MessageContent;

          sendMessage.mutate(
            { conversationId: conversation.id, content, replyToMessageId: replyTo?.id },
            {
              onSuccess: () => {
                setText('');
                clearMedia();
                onCancelReply?.();
                textareaRef.current?.focus();
              },
            }
          );
        },
      }
    );
  }, [pendingMedia, isDisabled, uploadMedia, conversation.id, text, sendMessage]);

  const handleTemplateSelect = useCallback(
    (template: TemplateData, params?: Record<string, string>) => {
      const bodyParams = params
        ? Object.entries(params)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([, value]) => ({ type: 'text' as const, text: value }))
        : [];

      claimConversation();
      sendTemplate(
        {
          conversationId: conversation.id,
          templateId: template.id,
          parameters: bodyParams.length > 0 ? { body: bodyParams } : undefined,
        },
        {
          onSuccess: () => {
            setShowTemplates(false);
          },
        }
      );
    },
    [sendTemplate, conversation.id, claimConversation]
  );

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();

    // If media is pending, send media message instead
    if (pendingMedia) {
      claimConversation();
      handleSendMedia();
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText || isDisabled) return;

    // Clear immediately — optimistic message already in cache via onMutate
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    textareaRef.current?.focus();

    claimConversation();
    sendTextMessage({ conversationId: conversation.id, text: trimmedText, replyToMessageId: replyTo?.id });
    onCancelReply?.();
  }, [text, isDisabled, sendTextMessage, conversation.id, pendingMedia, handleSendMedia, replyTo, onCancelReply, claimConversation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    setText(textarea.value);
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = newHeight + 'px';
  }, []);

  /**
   * `.composer__channels` — o handoff mostra os canais disponíveis para responder.
   * No app real a conversa está presa a um canal só (o do `messaging_channels`
   * da conversa), então esse canal aparece sempre como `--active` e não há
   * troca de canal a preservar: essa é a "seleção" real do sistema.
   */
  const channelBar = (
    <div className="composer__channels">
      <span>responder por</span>
      <span className="composer__channel composer__channel--active">
        <ChannelIndicator type={conversation.channelType} size="sm" />
        {conversation.channelName}
      </span>
      <span className="spacer" />
      <WindowExpiryBadge windowExpiresAt={conversation.windowExpiresAt} variant="inline" />
    </div>
  );

  // Converting state — shown while webm → mp3 encoding runs
  if (isConverting) {
    return (
      <div className="composer">
        <div className="loading-more" style={{ paddingTop: 0 }}>
          <span className="spinner" aria-hidden="true" />
          processando áudio…
        </div>
      </div>
    );
  }

  // Recording state — shown instead of the normal input
  if (isRecording) {
    return (
      <div className="composer">
        <div className="composer__row" style={{ alignItems: 'center' }}>
          <span className="dot dot--pulse dot--danger" aria-hidden="true" />
          <span className="num" style={{ color: 'var(--danger)', fontWeight: 700 }}>
            {formatDuration(recordingDuration)}
          </span>
          <span className="meta spacer">gravando áudio…</span>
          <button
            type="button"
            onClick={cancelRecording}
            className="btn btn--ghost"
            title="Cancelar gravação"
            aria-label="Cancelar gravação"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            cancelar
          </button>
          <button
            type="button"
            onClick={stopRecording}
            className="btn btn--primary"
            title="Parar e enviar"
            aria-label="Parar e enviar"
          >
            <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            enviar
          </button>
        </div>
      </div>
    );
  }

  // Show template selector when window expired or when manually opened
  if (showTemplates || conversation.isWindowExpired) {
    return (
      <div className="composer">
        {conversation.isWindowExpired && !showTemplates && (
          <>
            <div className="banner banner--hitl">
              <span className="banner--hitl__mark" aria-hidden="true">
                <Clock className="w-4 h-4" />
              </span>
              <span>
                <span className="banner__title">janela de resposta expirada</span>
                <span className="banner__text" style={{ display: 'block' }}>
                  use um template aprovado para reabrir a conversa
                </span>
              </span>
            </div>
            <div className="composer__row">
              <span className="spacer" />
              <button type="button" onClick={() => setShowTemplates(true)} className="btn btn--primary">
                enviar template
              </button>
            </div>
          </>
        )}
        {showTemplates && (
          <div style={{ height: 400 }}>
            <TemplateSelector
              templates={templates}
              isLoading={isLoadingTemplates || isSendingTemplate}
              onSelect={handleTemplateSelect}
              onCancel={() => setShowTemplates(false)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="composer">
      {channelBar}

      {/* Reply preview bar */}
      {replyTo && (
        <div className="banner banner--info">
          <Reply className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="label">
              {replyTo.direction === 'outbound' ? 'Você' : (replyTo.senderName ?? 'Contato')}
            </p>
            <p className="banner__text truncate">
              {replyTo.contentType === 'text'
                ? (replyTo.content as { text: string }).text
                : replyTo.contentType === 'audio' ? '🎤 Áudio'
                : replyTo.contentType === 'image' ? '📷 Foto'
                : replyTo.contentType === 'document' ? '📄 Documento'
                : 'Mensagem'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="btn btn--quiet"
            aria-label="Cancelar resposta"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Media preview */}
      {pendingMedia && (
        <div className="banner banner--info">
          {pendingMedia.preview ? (
            <img
              src={pendingMedia.preview}
              alt="Preview"
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <span className="actor actor--auto" style={{ width: 36, height: 36 }}>
              {pendingMedia.mediaType === 'document' ? (
                <FileIcon className="w-4 h-4" />
              ) : pendingMedia.mediaType === 'audio' ? (
                <Mic className="w-4 h-4" />
              ) : (
                <Image className="w-4 h-4" />
              )}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="banner__title truncate">{pendingMedia.file.name}</p>
            <p className="banner__text">{formatFileSize(pendingMedia.file.size)}</p>
          </div>
          <button type="button" onClick={clearMedia} className="btn btn--quiet" aria-label="Remover anexo">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="composer__row">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="btn btn--ghost"
          title="Anexar arquivo"
          aria-label="Anexar arquivo"
        >
          {isUploading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <Paperclip className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        <label htmlFor="message-input" className="sr-only">
          {pendingMedia ? 'Adicionar legenda (opcional)' : 'Digite uma mensagem'}
        </label>
        <textarea
          ref={textareaRef}
          id="message-input"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={pendingMedia ? 'adicionar legenda (opcional)…' : 'escreva ou peça um rascunho ao agente…'}
          disabled={isDisabled}
          rows={1}
          aria-label={pendingMedia ? 'Adicionar legenda (opcional)' : 'Digite uma mensagem'}
          className="input input--textarea"
          style={{ height: 'auto', minHeight: 44, maxHeight: 120, resize: 'none' }}
        />

        <div className="relative flex items-end flex-shrink-0" ref={emojiPickerRef}>
          {showEmojiPicker && (
            <div className="absolute bottom-full right-0 mb-2 z-50">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={Theme.AUTO}
                width={320}
                height={400}
                searchPlaceholder="Buscar emoji..."
                lazyLoadEmojis
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(prev => !prev)}
            className={cn('btn btn--ghost', showEmojiPicker && 'chip--ia')}
            title="Emojis"
            aria-label="Emojis"
          >
            <Smile className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="btn btn--ghost"
            title="Enviar template"
            aria-label="Enviar template"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Send or mic button */}
        {showMicButton ? (
          <button
            type="button"
            onClick={startRecording}
            className="btn btn--ghost btn--lg"
            title="Gravar áudio"
            aria-label="Gravar áudio"
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={(!text.trim() && !pendingMedia) || isDisabled}
            aria-label="Enviar mensagem"
            className="btn btn--primary btn--lg"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            enviar
          </button>
        )}
      </div>
    </form>
  );
}
