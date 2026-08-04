'use client'

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { getErrorMessage } from '@/lib/utils/errorUtils';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { isE164, normalizePhoneE164 } from '@/lib/phone';
import { usePersistedState } from '@/hooks/usePersistedState';
import { Loader2, Check, Eye, EyeOff, Camera } from 'lucide-react';

/**
 * Componente React `ProfilePage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ProfilePage: React.FC = () => {
    const { profile, refreshProfile } = useAuth();

    // Em ambientes onde as variáveis de ambiente não estão configuradas,
    // nosso helper pode retornar `null` para evitar crash.
    const sb = supabase;

    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Performance: memoize validation (avoids regex work on unrelated state changes).
    const passwordRequirements = useMemo(() => ({
        minLength: newPassword.length >= 6,
        hasLowercase: /[a-z]/.test(newPassword),
        hasUppercase: /[A-Z]/.test(newPassword),
        hasDigit: /\d/.test(newPassword),
    }), [newPassword]);
    const isPasswordValid = useMemo(() => Object.values(passwordRequirements).every(Boolean), [passwordRequirements]);

    // Campos do perfil
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nickname, setNickname] = useState('');
    const [phone, setPhone] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    const [isChangingEmail, setIsChangingEmail] = useState(false);
    const [newEmail, setNewEmail] = useState('');

    // Preferências de notificação — locais (sem backend dedicado ainda), mesmo
    // padrão de `usePersistedState` já usado em `useSettingsController`.
    const [notifyHitlDecision, setNotifyHitlDecision] = usePersistedState<boolean>('crm_notify_hitl_decision', true);
    const [notifyStalledDeal, setNotifyStalledDeal] = usePersistedState<boolean>('crm_notify_stalled_deal', true);
    const [notifyAiExecuted, setNotifyAiExecuted] = usePersistedState<boolean>('crm_notify_ai_executed', false);

    // Carrega dados do perfil
    useEffect(() => {
        if (profile) {
            setFirstName(profile.first_name || '');
            setLastName(profile.last_name || '');
            setNickname(profile.nickname || '');
            setPhone(normalizePhoneE164(profile.phone || ''));
            setAvatarUrl(profile.avatar_url || null);
        }
    }, [profile]);

    const initials = useMemo(() => {
        if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
        if (nickname) return nickname.substring(0, 2).toUpperCase();
        return profile?.email?.substring(0, 2).toUpperCase() || 'U';
    }, [firstName, lastName, nickname, profile?.email]);

    const displayName = useMemo(() => {
        if (firstName && lastName) return `${firstName} ${lastName}`;
        if (nickname) return nickname;
        if (firstName) return firstName;
        return profile?.email?.split('@')[0] || 'Usuário';
    }, [firstName, lastName, nickname, profile?.email]);

    const roleLabel = profile?.role === 'admin' ? 'admin' : 'vendedor';

    const triggerAvatarPicker = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Sem Supabase não há como salvar/atualizar perfil.
    // Hooks MUST come before early returns (rules-of-hooks).
    if (!sb) {
        return (
            <div className="screen__inner screen__inner--narrow">
                <section className="panel">
                    <h2 className="panel__title title-md">configuração incompleta</h2>
                    <p className="meta">
                        O Supabase não está configurado neste ambiente. Verifique as variáveis de ambiente
                        (URL e ANON KEY) para usar a página de perfil.
                    </p>
                </section>
            </div>
        );
    }

    // Upload de avatar
    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !profile?.id) return;

        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'Por favor, selecione uma imagem.' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'A imagem deve ter no máximo 2MB.' });
            return;
        }

        setUploadingAvatar(true);
        setMessage(null);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${profile.id}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await sb.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = sb.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

            const { error: updateError } = await sb
                .from('profiles')
                .update({ avatar_url: urlWithTimestamp })
                .eq('id', profile.id);

            if (updateError) throw updateError;

            setAvatarUrl(urlWithTimestamp);
            if (refreshProfile) await refreshProfile();
            setMessage({ type: 'success', text: 'Foto atualizada!' });
        } catch (err: any) {
            console.error('Upload error:', err);
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setUploadingAvatar(false);
        }
    };

    const saveField = async (updates: Record<string, string | null>) => {
        if (!profile?.id) return;
        setMessage(null);
        try {
            const { error } = await sb.from('profiles').update(updates).eq('id', profile.id);
            if (error) throw error;
            if (refreshProfile) await refreshProfile();
        } catch (err: any) {
            setMessage({ type: 'error', text: getErrorMessage(err) });
        }
    };

    const handleSaveName = () => saveField({ first_name: firstName.trim() || null });
    const handleSaveLastName = () => saveField({ last_name: lastName.trim() || null });
    const handleSaveNickname = () => saveField({ nickname: nickname.trim() || null });

    const handleSavePhone = async () => {
        const normalizedPhone = normalizePhoneE164(phone);
        if (normalizedPhone && !isE164(normalizedPhone)) {
            setMessage({ type: 'error', text: 'Telefone inválido. Use o formato E.164 (ex.: +5511999999999).' });
            return;
        }
        await saveField({ phone: normalizedPhone || null });
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'As senhas não coincidem.' });
            return;
        }

        if (!isPasswordValid) {
            setMessage({ type: 'error', text: 'A senha não atende aos requisitos mínimos.' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const { error } = await sb.auth.updateUser({ password: newPassword });
            if (error) throw error;

            setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
            setIsChangingPassword(false);
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setLoading(false);
        }
    };

    const handleChangeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setLoading(true);

        try {
            const { error } = await sb.auth.updateUser({ email: newEmail });
            if (error) throw error;

            setMessage({ type: 'success', text: 'E-mail de confirmação enviado para o novo endereço!' });
            setIsChangingEmail(false);
            setNewEmail('');
        } catch (err: any) {
            setMessage({ type: 'error', text: getErrorMessage(err) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="screen__inner screen__inner--narrow">
            {message && (
                <p className={`banner ${message.type === 'success' ? '' : 'banner--error'}`} style={message.type === 'success' ? { background: 'var(--success-soft)', color: '#1c7a4a' } : undefined}>
                    {message.type === 'success' && <Check className="w-4 h-4" />}
                    {message.text}
                </p>
            )}

            {/* Avatar + identidade */}
            <section className="panel setting-row">
                <div className="relative group" style={{ position: 'relative' }}>
                    {avatarUrl ? (
                        <Image
                            src={avatarUrl}
                            alt="Avatar"
                            width={60}
                            height={60}
                            className="avatar avatar--xl"
                            style={{ objectFit: 'cover' }}
                            unoptimized
                        />
                    ) : (
                        <span className="avatar avatar--pink avatar--xl">{initials}</span>
                    )}
                    {uploadingAvatar && (
                        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.4)', borderRadius: '50%' }}>
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </span>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                    />
                </div>
                <span className="setting-row__text">
                    <span className="title-lg">{displayName}</span>
                    <span className="setting-row__desc">{roleLabel} · {profile?.email}</span>
                </span>
                <button className="btn btn--ghost" type="button" onClick={triggerAvatarPicker} disabled={uploadingAvatar}>
                    <Camera className="w-3.5 h-3.5" />
                    trocar foto
                </button>
            </section>

            {/* Dados */}
            <section className="panel">
                <h2 className="panel__title title-md">dados</h2>
                <dl className="form-grid">
                    <dt>nome</dt>
                    <dd>
                        <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={handleSaveName} placeholder="Seu nome" />
                    </dd>

                    <dt>sobrenome</dt>
                    <dd>
                        <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={handleSaveLastName} placeholder="Seu sobrenome" />
                    </dd>

                    <dt>apelido</dt>
                    <dd>
                        <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} onBlur={handleSaveNickname} placeholder="Como quer ser chamado" />
                    </dd>

                    <dt>telefone</dt>
                    <dd>
                        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={handleSavePhone} placeholder="+5511999999999" />
                    </dd>

                    <dt>e-mail</dt>
                    <dd>
                        <input className="input" value={profile?.email || ''} disabled />
                        {!isChangingEmail && (
                            <p className="meta">
                                <a href="#" onClick={(e) => { e.preventDefault(); setIsChangingEmail(true); }}>alterar</a>
                            </p>
                        )}
                        {isChangingEmail && (
                            <form onSubmit={handleChangeEmail} className="chip-row" style={{ marginTop: 6, gap: 8 }}>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="input"
                                    placeholder="seu@novoemail.com"
                                    required
                                />
                                <button type="submit" disabled={loading} className="btn btn--primary">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'confirmar'}
                                </button>
                                <button type="button" className="btn btn--quiet" onClick={() => { setIsChangingEmail(false); setNewEmail(''); }}>
                                    cancelar
                                </button>
                            </form>
                        )}
                    </dd>

                    <dt>senha</dt>
                    <dd>
                        <input className="input" type="password" value="**********" disabled />
                        {!isChangingPassword && (
                            <p className="meta">
                                <a href="#" onClick={(e) => { e.preventDefault(); setIsChangingPassword(true); }}>alterar</a>
                            </p>
                        )}
                        {isChangingPassword && (
                            <form onSubmit={handleChangePassword} className="field" style={{ marginTop: 6, gap: 8 }}>
                                <div className="chip-row" style={{ gap: 8 }}>
                                    <input
                                        type={showPasswords ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="input"
                                        placeholder="Nova senha (mínimo 6 caracteres)"
                                        required
                                        minLength={6}
                                        style={{ flex: 1 }}
                                    />
                                    <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="btn btn--ghost" aria-label={showPasswords ? 'Ocultar senha' : 'Mostrar senha'}>
                                        {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <input
                                    type={showPasswords ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="input"
                                    placeholder="Confirmar nova senha"
                                    required
                                />
                                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                                    <p className="meta" style={{ color: 'var(--danger)' }}>As senhas não coincidem</p>
                                )}
                                <div className="chip-row" style={{ gap: 8 }}>
                                    <button type="submit" disabled={loading} className="btn btn--primary">
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'salvar senha'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn--quiet"
                                        onClick={() => { setIsChangingPassword(false); setNewPassword(''); setConfirmPassword(''); }}
                                    >
                                        cancelar
                                    </button>
                                </div>
                            </form>
                        )}
                    </dd>
                </dl>
            </section>

            {/* Notificações */}
            <section className="panel">
                <h2 className="panel__title title-md">como quero ser avisada</h2>
                <ul>
                    <li className="setting-row">
                        <span className="setting-row__text">
                            <span className="setting-row__title">decisão da IA esperando aprovação</span>
                            <span className="setting-row__desc">push + WhatsApp na hora</span>
                        </span>
                        <button
                            type="button"
                            className={`toggle ${notifyHitlDecision ? 'toggle--hitl' : ''}`}
                            aria-pressed={notifyHitlDecision}
                            aria-label={notifyHitlDecision ? 'ativo' : 'inativo'}
                            onClick={() => setNotifyHitlDecision((v) => !v)}
                        />
                    </li>
                    <li className="setting-row">
                        <span className="setting-row__text">
                            <span className="setting-row__title">deal parado há mais de 5 dias</span>
                            <span className="setting-row__desc">resumo diário às 9h</span>
                        </span>
                        <button
                            type="button"
                            className={`toggle ${notifyStalledDeal ? 'toggle--on' : ''}`}
                            aria-pressed={notifyStalledDeal}
                            aria-label={notifyStalledDeal ? 'ativo' : 'inativo'}
                            onClick={() => setNotifyStalledDeal((v) => !v)}
                        />
                    </li>
                    <li className="setting-row">
                        <span className="setting-row__text">
                            <span className="setting-row__title">tudo que o agente executa sozinho</span>
                            <span className="setting-row__desc">desligado — fica no histórico</span>
                        </span>
                        <button
                            type="button"
                            className={`toggle ${notifyAiExecuted ? 'toggle--on' : ''}`}
                            aria-pressed={notifyAiExecuted}
                            aria-label={notifyAiExecuted ? 'ativo' : 'inativo'}
                            onClick={() => setNotifyAiExecuted((v) => !v)}
                        />
                    </li>
                </ul>
            </section>

            {/* Sessão */}
            <section className="panel">
                <h2 className="panel__title title-md">sessão</h2>
                <ul className="panel__body">
                    <li className="setting-row">
                        <span className="dot dot--success" />
                        <span className="setting-row__text">
                            {typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').slice(-2).join(' ') : 'este dispositivo'}
                            <span className="muted"> · esta sessão</span>
                        </span>
                    </li>
                </ul>
            </section>
        </div>
    );
};

export default ProfilePage;
