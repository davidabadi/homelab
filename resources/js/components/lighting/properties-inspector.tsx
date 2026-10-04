import { Ruler, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeviceProperties } from './device-properties';
import { EnclosureProperties } from './enclosure-properties';
import { RailProperties, DuctProperties } from './hardware-properties';
import type {
    DesignConnection,
    DesignDuct,
    DesignRail,
    LightingDesign,
    LightingLayout,
    LightingSelection,
    PlacedComponent,
} from './types';
import { WireProperties } from './wire-properties';
export type PropertiesInspectorProps = {
    layout: LightingLayout;
    selection: LightingSelection;
    onUpdateDesign: (patch: Partial<LightingDesign>) => void;
    onUpdateComponent: (id: string, patch: Partial<PlacedComponent>) => void;
    onUpdateRail: (id: string, patch: Partial<DesignRail>) => void;
    onUpdateDuct: (id: string, patch: Partial<DesignDuct>) => void;
    onUpdateConnection: (id: string, patch: Partial<DesignConnection>) => void;
    onDuplicateComponent: (id: string) => void;
    onDeleteSelection: () => void;
    onDetachComponent: (id: string) => void;
};

export function PropertiesInspector(props: PropertiesInspectorProps) {
    const { layout, selection } = props;
    const component =
        selection?.type === 'component'
            ? layout.components.find(
                  (item) => item.portable_id === selection.id,
              )
            : null;
    const definition = component
        ? layout.definitions.find(
              (item) => item.id === component.component_definition_id,
          )
        : null;
    const rail =
        selection?.type === 'rail'
            ? layout.rails.find((item) => item.portable_id === selection.id)
            : null;
    const duct =
        selection?.type === 'duct'
            ? layout.ducts.find((item) => item.portable_id === selection.id)
            : null;
    const connection =
        selection?.type === 'connection'
            ? layout.connections.find(
                  (item) => item.portable_id === selection.id,
              )
            : null;
    const title = component
        ? 'Device properties'
        : rail
          ? 'DIN rail'
          : duct
            ? 'Wire duct'
            : connection
              ? 'Connection'
              : 'Enclosure';

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between border-b p-4">
                <h2 className="text-sm font-semibold">{title}</h2>
                <Ruler className="size-4 text-muted-foreground" />
            </header>
            <div className="grid min-h-0 gap-5 overflow-y-auto p-4">
                {component && definition ? (
                    <DeviceProperties
                        component={component}
                        definition={definition}
                        onUpdate={props.onUpdateComponent}
                        onDuplicate={props.onDuplicateComponent}
                        onDetach={props.onDetachComponent}
                    />
                ) : rail ? (
                    <RailProperties
                        rail={rail}
                        components={layout.components}
                        onUpdate={props.onUpdateRail}
                    />
                ) : duct ? (
                    <DuctProperties duct={duct} onUpdate={props.onUpdateDuct} />
                ) : connection ? (
                    <WireProperties
                        connection={connection}
                        layout={layout}
                        onUpdate={props.onUpdateConnection}
                    />
                ) : (
                    <EnclosureProperties
                        design={layout.design}
                        onUpdate={props.onUpdateDesign}
                    />
                )}
                {selection && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        onClick={props.onDeleteSelection}
                    >
                        <Trash2 />
                        Delete{' '}
                        {selection.type === 'component'
                            ? 'device'
                            : selection.type === 'connection'
                              ? 'connection'
                              : selection.type}
                    </Button>
                )}
            </div>
        </div>
    );
}
