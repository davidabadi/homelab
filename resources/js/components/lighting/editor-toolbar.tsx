import {
    ArrowLeft,
    BookOpen,
    Check,
    CircleAlert,
    LayoutPanelTop,
    ListTree,
    LoaderCircle,
    MoreHorizontal,
    Plus,
    Redo2,
    Settings2,
    Undo2,
    Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SaveStatus } from './save-queue';

export type EditorToolbarProps = {
    name: string;
    status: SaveStatus;
    error?: string | null;
    canUndo: boolean;
    canRedo: boolean;
    wiring: boolean;
    onBack: () => void;
    onNameChange: (name: string) => void;
    onAddDevice: () => void;
    onAddRow: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onSettings: () => void;
    onSummary: () => void;
    onWiring: () => void;
    onRetry: () => void;
    onCatalog: () => void;
};

export function EditorToolbar(props: EditorToolbarProps) {
    const status = {
        saved: { text: 'Saved', icon: Check, tone: 'text-emerald-400' },
        saving: { text: 'Saving…', icon: LoaderCircle, tone: 'text-slate-400' },
        dirty: { text: 'Saving…', icon: LoaderCircle, tone: 'text-slate-400' },
        failed: {
            text: 'Save failed',
            icon: CircleAlert,
            tone: 'text-amber-300',
        },
    }[props.status];

    return (
        <header className="z-20 shrink-0 border-b border-white/10 bg-[#191c22]">
            <div className="flex min-h-18 items-center gap-4 px-5 xl:px-7">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Back to designs"
                        className="shrink-0 text-slate-400 hover:text-slate-100"
                        onClick={props.onBack}
                    >
                        <ArrowLeft />
                    </Button>
                    <div className="max-w-80 min-w-0 flex-1">
                        <label
                            htmlFor="lighting-design-name"
                            className="sr-only"
                        >
                            Design name
                        </label>
                        <Input
                            id="lighting-design-name"
                            className="h-9 border-transparent bg-transparent px-1 text-base font-semibold text-slate-100 shadow-none hover:border-white/10 focus:border-white/20"
                            value={props.name}
                            maxLength={255}
                            onChange={(event) =>
                                props.onNameChange(event.target.value)
                            }
                        />
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button
                        onClick={props.onAddDevice}
                        className="h-10 bg-blue-500 px-4 text-white shadow-[0_2px_8px_#0003] hover:bg-blue-400"
                    >
                        <Plus className="size-4" /> Add device
                    </Button>
                    <Button
                        variant="outline"
                        onClick={props.onAddRow}
                        className="h-10 border-white/15 bg-transparent text-slate-200 hover:bg-white/5"
                    >
                        <Plus className="size-4" /> Add row
                    </Button>
                </div>
                <div className="flex flex-1 items-center justify-end gap-3">
                    <span
                        role="status"
                        aria-live="polite"
                        className={`flex shrink-0 items-center gap-1.5 text-xs ${status.tone}`}
                    >
                        <status.icon
                            className={`size-3.5 ${props.status === 'saving' || props.status === 'dirty' ? 'animate-spin' : ''}`}
                        />
                        <span className="hidden xl:inline">{status.text}</span>
                    </span>
                    {props.status === 'failed' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={props.onRetry}
                        >
                            Retry
                        </Button>
                    )}
                    <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
                        {[
                            {
                                label: 'Undo (Ctrl+Z)',
                                icon: Undo2,
                                disabled: !props.canUndo,
                                action: props.onUndo,
                            },
                            {
                                label: 'Redo (Ctrl+Shift+Z)',
                                icon: Redo2,
                                disabled: !props.canRedo,
                                action: props.onRedo,
                            },
                        ].map((tool) => (
                            <Tooltip key={tool.label}>
                                <TooltipTrigger asChild>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-9 text-slate-400"
                                        aria-label={tool.label}
                                        disabled={tool.disabled}
                                        onClick={tool.action}
                                    >
                                        <tool.icon className="size-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent className="lighting-editor-overlay">
                                    {tool.label}
                                </TooltipContent>
                            </Tooltip>
                        ))}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-9 text-slate-400"
                                    aria-label="Panel menu"
                                >
                                    <MoreHorizontal className="size-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="lighting-editor-overlay dark w-52"
                            >
                                <DropdownMenuItem onClick={props.onSettings}>
                                    <Settings2 /> Panel settings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={props.onSummary}>
                                    <ListTree /> Design summary
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={props.onWiring}>
                                    {props.wiring ? (
                                        <LayoutPanelTop />
                                    ) : (
                                        <Unplug />
                                    )}
                                    {props.wiring
                                        ? 'Panel builder'
                                        : 'Wiring view'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={props.onCatalog}>
                                    <BookOpen /> Component catalog
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
            {props.error && (
                <div
                    role="alert"
                    className="border-t border-amber-400/15 bg-amber-500/5 px-7 py-2.5 text-sm text-amber-200"
                >
                    {props.error}
                </div>
            )}
        </header>
    );
}
