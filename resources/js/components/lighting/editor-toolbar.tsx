import {
    ArrowLeft,
    BookOpen,
    Check,
    CircleAlert,
    Eye,
    Grid2X2,
    LoaderCircle,
    Magnet,
    Maximize,
    Redo2,
    RotateCcw,
    Tag,
    Undo2,
    Unplug,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export type EditorToolbarProps = {
    name: string;
    status: 'saved' | 'saving' | 'failed' | 'dirty';
    error?: string | null;
    zoom: number;
    showGrid: boolean;
    showWiring: boolean;
    showLabels: boolean;
    snapToGrid: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onBack: () => void;
    onNameChange: (name: string) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFit: () => void;
    onToggleGrid: () => void;
    onToggleWiring: () => void;
    onToggleLabels: () => void;
    onToggleSnap: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onRetry?: () => void;
    onCatalog?: () => void;
};

function ToolButton({
    label,
    children,
    pressed,
    disabled,
    onClick,
}: {
    label: string;
    children: React.ReactNode;
    pressed?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant={pressed ? 'secondary' : 'ghost'}
                    aria-label={label}
                    aria-pressed={pressed}
                    disabled={disabled}
                    className="size-8 shrink-0"
                    onClick={onClick}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export function EditorToolbar(props: EditorToolbarProps) {
    const status = {
        saved: {
            text: 'Saved',
            icon: Check,
            tone: 'text-emerald-600 dark:text-emerald-400',
        },
        saving: {
            text: 'Saving…',
            icon: LoaderCircle,
            tone: 'text-amber-600 dark:text-amber-400',
        },
        dirty: {
            text: 'Unsaved changes',
            icon: Eye,
            tone: 'text-muted-foreground',
        },
        failed: {
            text: 'Save failed',
            icon: CircleAlert,
            tone: 'text-destructive',
        },
    }[props.status];

    return (
        <header className="z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-3 py-2.5 lg:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <ToolButton label="Back to designs" onClick={props.onBack}>
                    <ArrowLeft />
                </ToolButton>
                <div className="min-w-0 flex-1 sm:max-w-72">
                    <label className="sr-only" htmlFor="lighting-design-name">
                        Design name
                    </label>
                    <Input
                        id="lighting-design-name"
                        value={props.name}
                        maxLength={255}
                        className="h-8 border-transparent bg-transparent font-semibold shadow-none hover:border-input focus:border-input"
                        onChange={(event) =>
                            props.onNameChange(event.target.value)
                        }
                    />
                </div>
                <span
                    role="status"
                    aria-live="polite"
                    className={`flex shrink-0 items-center gap-1.5 text-xs ${status.tone}`}
                >
                    <status.icon
                        className={`size-3.5 ${props.status === 'saving' ? 'animate-spin' : ''}`}
                    />
                    <span className="hidden sm:inline">{status.text}</span>
                </span>
                {props.status === 'failed' && props.onRetry && (
                    <Button variant="outline" size="sm" onClick={props.onRetry}>
                        <RotateCcw className="size-3.5" /> Retry
                    </Button>
                )}
            </div>
            <div className="flex items-center gap-0.5 overflow-x-auto">
                <ToolButton
                    label="Undo (Ctrl+Z)"
                    disabled={!props.canUndo}
                    onClick={props.onUndo}
                >
                    <Undo2 />
                </ToolButton>
                <ToolButton
                    label="Redo (Ctrl+Shift+Z)"
                    disabled={!props.canRedo}
                    onClick={props.onRedo}
                >
                    <Redo2 />
                </ToolButton>
                <span className="mx-1 h-5 w-px bg-border" />
                <ToolButton label="Zoom out" onClick={props.onZoomOut}>
                    <ZoomOut />
                </ToolButton>
                <span
                    className="min-w-11 text-center font-mono text-xs text-muted-foreground"
                    aria-label="Canvas zoom"
                >
                    {Math.round(props.zoom * 100)}%
                </span>
                <ToolButton label="Zoom in" onClick={props.onZoomIn}>
                    <ZoomIn />
                </ToolButton>
                <ToolButton label="Fit panel" onClick={props.onFit}>
                    <Maximize />
                </ToolButton>
                <span className="mx-1 h-5 w-px bg-border" />
                <ToolButton
                    label="Show grid"
                    pressed={props.showGrid}
                    onClick={props.onToggleGrid}
                >
                    <Grid2X2 />
                </ToolButton>
                <ToolButton
                    label="Snap to grid"
                    pressed={props.snapToGrid}
                    onClick={props.onToggleSnap}
                >
                    <Magnet />
                </ToolButton>
                <ToolButton
                    label="Show wiring"
                    pressed={props.showWiring}
                    onClick={props.onToggleWiring}
                >
                    <Unplug />
                </ToolButton>
                <ToolButton
                    label="Show labels"
                    pressed={props.showLabels}
                    onClick={props.onToggleLabels}
                >
                    <Tag />
                </ToolButton>
                {props.onCatalog && (
                    <ToolButton
                        label="Component catalog"
                        onClick={props.onCatalog}
                    >
                        <BookOpen />
                    </ToolButton>
                )}
            </div>
            {props.error && (
                <p role="alert" className="w-full text-xs text-destructive">
                    {props.error}
                </p>
            )}
        </header>
    );
}
