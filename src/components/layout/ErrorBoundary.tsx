import { Component, type ReactNode } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { AlertTriangle } from 'lucide-react'
interface Props {
  children: ReactNode
  resetKey?: string
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, info.componentStack)
    }
  }

  componentDidUpdate(previousProps: Props) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="flex min-h-80 items-center justify-center p-6 sm:p-12">
          <Card className="max-w-md">
            <Card.Content className="flex flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle size={32} className="text-danger" aria-hidden="true" />
              <div>
                <p className="text-foreground text-lg font-semibold">Something went wrong</p>
                <p className="text-default-400 mt-1 text-sm">
                  Reload this page or use the navigation to open another page.
                </p>
              </div>
              <Button
                variant="tertiary"
                onPress={() => window.location.reload()}
              >
                Reload page
              </Button>
            </Card.Content>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
