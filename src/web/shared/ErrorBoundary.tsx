import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { BentoGrid, Button, Tile } from './ui/index.ts';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="main-container">
          <BentoGrid cols={4} label="Erro inesperado">
            <Tile c={4} variant="warning">
              <div className="error-heading">
                <AlertTriangle size={22} aria-hidden="true" />
                <span>Algo deu errado ao renderizar esta tela</span>
              </div>
              <p className="text-muted m-0">
                Você pode recarregar a página ou voltar para o encurtador inicial.
              </p>
              <div className="cluster">
                <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>Recarregar página</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    this.setState({ hasError: false });
                    window.location.assign('/');
                  }}
                >
                  Voltar ao início
                </Button>
              </div>
            </Tile>
          </BentoGrid>
        </div>
      );
    }

    return this.props.children;
  }
}
