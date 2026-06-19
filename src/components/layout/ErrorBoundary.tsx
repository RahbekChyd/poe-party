import { Component, type ReactNode } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { AlertTriangle } from 'lucide-react'
interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-12">
          <Card className="max-w-md">
            <Card.Content className="flex flex-col items-center gap-4 p-8 text-center">
              <AlertTriangle size={32} className="text-danger" />
              <div>
                <p className="text-foreground text-lg font-semibold">Something went wrong</p>
                <p className="text-default-400 mt-1 text-sm">
                  {this.state.error?.message ?? 'An unexpected error occurred.'}
                </p>
              </div>
              <Button
                variant="tertiary"
                onPress={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </Button>
            </Card.Content>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
