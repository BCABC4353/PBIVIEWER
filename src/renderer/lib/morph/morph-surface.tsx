import React, { useRef, forwardRef } from 'react';
import { useSharedElementMorph } from './use-shared-element-morph';
import type { MorphCallbacks, SharedElementMorphHandle } from './use-shared-element-morph';

export interface MorphSurfaceProps extends MorphCallbacks {
  sourceRef: React.RefObject<Element | null>;
  sourceContentRef?: React.RefObject<HTMLElement | null>;
  targetContentRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  imperativeRef?: React.RefObject<SharedElementMorphHandle | null>;
  'data-morph-node'?: string;
}

export const MorphSurface = forwardRef<HTMLDivElement, MorphSurfaceProps>(
  function MorphSurface(props, forwardedRef) {
    const {
      sourceRef,
      sourceContentRef,
      targetContentRef,
      children,
      style,
      className,
      imperativeRef,
      onOpened,
      onClosed,
      ...dataProps
    } = props;

    const internalRef = useRef<HTMLDivElement | null>(null);

    const morphRef = useRef<HTMLElement | null>(null);

    const mergedRef = (el: HTMLDivElement | null): void => {
      internalRef.current = el;
      morphRef.current = el;
      if (typeof forwardedRef === 'function') {
        forwardedRef(el);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    };

    const handle = useSharedElementMorph({
      morphRef,
      sourceRef,
      sourceContentRef,
      targetContentRef,
      onOpened,
      onClosed,
    });

    if (imperativeRef) {
      (imperativeRef as React.MutableRefObject<SharedElementMorphHandle | null>).current = handle;
    }

    return (
      <div
        ref={mergedRef}
        data-morph-node="true"
        style={{
          pointerEvents: 'none',
          ...style,
        }}
        className={className}
        {...dataProps}
      >
        {children}
      </div>
    );
  },
);
