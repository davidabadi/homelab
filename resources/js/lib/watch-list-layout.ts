export type BoundsLike = {
    left: number;
    top: number;
};

export function positionRelativeTo(
    bounds: BoundsLike,
    containerBounds: BoundsLike,
): BoundsLike {
    return {
        left: bounds.left - containerBounds.left,
        top: bounds.top - containerBounds.top,
    };
}

export function scrollTopAtAnchor(
    currentScrollTop: number,
    anchorTop: number,
    scrollContainerTop: number,
): number {
    return currentScrollTop + anchorTop - scrollContainerTop;
}

export function scrollTopAfterPrepend(
    currentScrollTop: number,
    currentScrollHeight: number,
    previousScrollHeight: number,
): number {
    return currentScrollTop + currentScrollHeight - previousScrollHeight;
}

export function shouldLoadOlderHistory(
    currentScrollTop: number,
    previousScrollTop: number,
    initialPlacementComplete: boolean,
    threshold: number,
): boolean {
    return (
        initialPlacementComplete &&
        currentScrollTop < previousScrollTop - 1 &&
        currentScrollTop <= threshold
    );
}
