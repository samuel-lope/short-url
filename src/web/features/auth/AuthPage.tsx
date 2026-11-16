import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const headingId = useId();
  const nameErrId = useId();
  const emailErrId = useId();
  const passErrId = useId();

  const validateAll = () => {
    const errors: Record<string, string> = {};
    if (isRegister && name.trim().length < 2) {
      errors.name = 'Informe seu nome com ao menos 2 caracteres.';
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Digite um e-mail no formato voce@exemplo.com.';
    }
    if (isRegister && password.length < 8) {
      errors.password = 'A senha precisa ter ao menos 8 caracteres.';
    } else if (!isRegister && password.length === 0) {
      errors.password = 'Informe sua senha.';
    }
    return errors;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors(validateAll());
  };

  const handleInput = (field: string, setter: (v: string) => void, value: string) => {
    setter(value);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);

    const errors = validateAll();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      if (errors.name) nameRef.current?.focus();
      else if (errors.email) emailRef.current?.focus();
      else if (errors.password) passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      if (isRegister) {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate('/app');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setSubmitting(false);
    }
  };

  const showErr = (field: string) => (touched[field] || submitted) && Boolean(fieldErrors[field]);

  return (
    <div className="main-narrow">
      <section className="y2k-window" aria-labelledby={headingId}>
        <div className="y2k-titlebar">
          <span>{isRegister ? 'CADASTRO.EXE' : 'LOGIN.EXE'}</span>
          <span className="y2k-titlebar-dots" aria-hidden="true">
            <span className="y2k-win-glyph">_</span>
            <span className="y2k-win-glyph">□</span>
            <span className="y2k-win-glyph">×</span>
          </span>
        </div>

        <div className="y2k-window-body">
          <h1 id={headingId} className="page-title">
            {isRegister ? 'Criar Conta' : 'Entrar'}
          </h1>

          <form className="form-stack" onSubmit={handleSubmit} noValidate aria-labelledby={headingId}>
            {isRegister && (
              <div className="field">
                <label htmlFor="auth-name" className="field-label">
                  Nome completo <span aria-hidden="true">*</span>
                </label>
                <input
                  ref={nameRef}
                  id="auth-name"
                  name="name"
                  type="text"
                  className={`y2k-input${showErr('name') ? ' user-invalid-fallback' : ''}`}
                  autoComplete="name"
                  required
                  enterKeyHint="next"
                  aria-invalid={showErr('name')}
                  aria-describedby={showErr('name') ? nameErrId : undefined}
                  value={name}
                  onChange={(e) => handleInput('name', setName, e.target.value)}
                  onBlur={() => handleBlur('name')}
                />
                {showErr('name') && (
                  <div id={nameErrId} className="field-error">
                    <span role="img" aria-label="Erro">
                      ❌
                    </span>
                    <span>{fieldErrors.name}</span>
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <label htmlFor="auth-email" className="field-label">
                E-mail <span aria-hidden="true">*</span>
              </label>
              <span id="email-hint" className="field-hint">
                Formato: voce@exemplo.com
              </span>
              <input
                ref={emailRef}
                id="auth-email"
                name="email"
                type="email"
                className={`y2k-input${showErr('email') ? ' user-invalid-fallback' : ''}`}
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                required
                enterKeyHint="next"
                aria-invalid={showErr('email')}
                aria-describedby={showErr('email') ? `email-hint ${emailErrId}` : 'email-hint'}
                value={email}
                onChange={(e) => handleInput('email', setEmail, e.target.value)}
                onBlur={() => handleBlur('email')}
              />
              {showErr('email') && (
                <div id={emailErrId} className="field-error">
                  <span role="img" aria-label="Erro">
                    ❌
                  </span>
                  <span>{fieldErrors.email}</span>
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="auth-password" className="field-label">
                Senha <span aria-hidden="true">*</span>
              </label>
              {isRegister && (
                <span id="password-hint" className="field-hint">
                  Mínimo de 8 caracteres.
                </span>
              )}
              <div className="password-wrap">
                <input
                  ref={passwordRef}
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`y2k-input${showErr('password') ? ' user-invalid-fallback' : ''}`}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 8 : 1}
                  required
                  enterKeyHint="done"
                  aria-invalid={showErr('password')}
                  aria-describedby={
                    [isRegister ? 'password-hint' : '', showErr('password') ? passErrId : '']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  value={password}
                  onChange={(e) => handleInput('password', setPassword, e.target.value)}
                  onBlur={() => handleBlur('password')}
                />
                <button
                  type="button"
                  className="y2k-btn y2k-btn-sm"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              {showErr('password') && (
                <div id={passErrId} className="field-error">
                  <span role="img" aria-label="Erro">
                    ❌
                  </span>
                  <span>{fieldErrors.password}</span>
                </div>
              )}
            </div>

            {serverError && (
              <div className="alert-error" role="alert">
                {serverError}
              </div>
            )}

            <button type="submit" className="y2k-btn y2k-btn-primary" disabled={submitting}>
              {submitting
                ? isRegister
                  ? 'Criando conta...'
                  : 'Entrando...'
                : isRegister
                  ? 'Criar conta'
                  : 'Entrar'}
            </button>
          </form>

          <p style={{ marginTop: '1.25rem', fontSize: '0.92rem' }}>
            {isRegister ? (
              <>
                Já tem conta? <Link to="/login">Entrar</Link>
              </>
            ) : (
              <>
                Ainda não tem conta? <Link to="/register">Criar conta</Link>
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
