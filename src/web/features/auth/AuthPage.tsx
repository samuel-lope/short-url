import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Eye, EyeOff, QrCode, Shuffle } from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { Alert, BentoGrid, Button, Field, TextInput, Tile } from '../../shared/ui/index.ts';

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
  const passErrId = useId();
  const passHintId = useId();

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
  const passError = showErr('password') ? fieldErrors.password : undefined;

  return (
    <BentoGrid cols={4} label={isRegister ? 'Criar conta' : 'Entrar'}>
      <Tile c={2} as="section" aria-labelledby={headingId}>
        <h1 id={headingId} className="page-title">
          {isRegister ? 'Criar conta' : 'Entrar'}
        </h1>

        <form className="form-stack" onSubmit={handleSubmit} noValidate aria-labelledby={headingId}>
          {isRegister && (
            <Field
              label="Nome completo"
              htmlFor="auth-name"
              required
              error={showErr('name') ? fieldErrors.name : undefined}
            >
              {({ inputId, describedBy, invalidClass }) => (
                <TextInput
                  ref={nameRef}
                  id={inputId}
                  name="name"
                  type="text"
                  className={invalidClass}
                  autoComplete="name"
                  required
                  enterKeyHint="next"
                  aria-invalid={showErr('name')}
                  aria-describedby={describedBy}
                  value={name}
                  onChange={(e) => handleInput('name', setName, e.target.value)}
                  onBlur={() => handleBlur('name')}
                />
              )}
            </Field>
          )}

          <Field
            label="E-mail"
            htmlFor="auth-email"
            hint="Formato: voce@exemplo.com"
            required
            error={showErr('email') ? fieldErrors.email : undefined}
          >
            {({ inputId, describedBy, invalidClass }) => (
              <TextInput
                ref={emailRef}
                id={inputId}
                name="email"
                type="email"
                className={invalidClass}
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                required
                enterKeyHint="next"
                aria-invalid={showErr('email')}
                aria-describedby={describedBy}
                value={email}
                onChange={(e) => handleInput('email', setEmail, e.target.value)}
                onBlur={() => handleBlur('email')}
              />
            )}
          </Field>

          <div className="field">
            <label htmlFor="auth-password" className="field-label">
              Senha <span aria-hidden="true">*</span>
            </label>
            {isRegister && (
              <span id={passHintId} className="field-hint">
                Mínimo de 8 caracteres.
              </span>
            )}
            <div className="password-wrap">
              <TextInput
                ref={passwordRef}
                id="auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className={passError ? 'user-invalid-fallback' : ''}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 8 : 1}
                required
                enterKeyHint="done"
                aria-invalid={Boolean(passError)}
                aria-describedby={
                  [isRegister ? passHintId : '', passError ? passErrId : ''].filter(Boolean).join(' ') || undefined
                }
                value={password}
                onChange={(e) => handleInput('password', setPassword, e.target.value)}
                onBlur={() => handleBlur('password')}
              />
              <Button
                size="sm"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </Button>
            </div>
            {passError && (
              <div id={passErrId} className="field-error">
                <span role="img" aria-label="Erro">
                  ❌
                </span>
                <span>{passError}</span>
              </div>
            )}
          </div>

          {serverError && <Alert tone="error">{serverError}</Alert>}

          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting
              ? isRegister
                ? 'Criando conta...'
                : 'Entrando...'
              : isRegister
                ? 'Criar conta'
                : 'Entrar'}
          </Button>
        </form>

        <p className="text-muted meta-text m-0">
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
      </Tile>

      <Tile
        c={2}
        variant="accent"
        title="Controle total sobre seus links"
        subtitle="Ao entrar com seu perfil de Usuário Registrado você gerencia URLs, destinos dinâmicos, QR Codes e métricas."
      >
        <ul className="feature-list">
          <li className="feature-list-item">
            <Shuffle size={17} aria-hidden="true" />
            <span>Troca instantânea de destino sem mudar o short link</span>
          </li>
          <li className="feature-list-item">
            <QrCode size={17} aria-hidden="true" />
            <span>QR Code dinâmico personalizável em SVG e PNG</span>
          </li>
          <li className="feature-list-item">
            <BarChart3 size={17} aria-hidden="true" />
            <span>Registro de uso por dia, dispositivo, país e origem</span>
          </li>
        </ul>
      </Tile>
    </BentoGrid>
  );
}
