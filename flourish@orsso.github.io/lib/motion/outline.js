import Cairo from 'cairo';

import {OutlineLight, OutlineStyle} from './catalog.js';

// Intensity at which the light and dark edges match 1.2.
export const REFERENCE_INTENSITY = 60;
const EDGES = {
    [OutlineStyle.LIGHT]: {shade: 1, alpha: 0.18},
    [OutlineStyle.DARK]: {shade: 0, alpha: 0.35},
};
const GLASS = {top: 0.11, bottom: 0.05, glint: 0.6};
const GLINTS = {
    [OutlineLight.TOP_LEFT]: [['top-left', 1], ['bottom-right', 0.7]],
    [OutlineLight.TOP]: [['top-left', 0.8], ['top-right', 0.8], ['bottom-left', 0.4], ['bottom-right', 0.4]],
    [OutlineLight.TOP_RIGHT]: [['top-right', 1], ['bottom-left', 0.7]],
};

export function outlinePaint(style, intensity, light, darkScheme) {
    const scale = intensity / REFERENCE_INTENSITY;
    if (style === OutlineStyle.NONE || scale === 0)
        return null;
    const alpha = value => Math.min(1, value * scale);
    if (style === OutlineStyle.GLASS) {
        return {
            shade: 1,
            top: alpha(GLASS.top),
            bottom: alpha(GLASS.bottom),
            glints: GLINTS[light].map(([corner, weight]) => [corner, alpha(GLASS.glint * weight)]),
        };
    }
    const edge = style === OutlineStyle.AUTO
        ? EDGES[darkScheme ? OutlineStyle.LIGHT : OutlineStyle.DARK]
        : EDGES[style];
    return {shade: edge.shade, top: alpha(edge.alpha), bottom: alpha(edge.alpha), glints: []};
}

export function roundedRect(cr, inset, width, height, radius) {
    const r = Math.max(0, Math.min(radius - inset, width / 2 - inset, height / 2 - inset));
    cr.newSubPath();
    cr.arc(width - inset - r, inset + r, r, -Math.PI / 2, 0);
    cr.arc(width - inset - r, height - inset - r, r, 0, Math.PI / 2);
    cr.arc(inset + r, height - inset - r, r, Math.PI / 2, Math.PI);
    cr.arc(inset + r, inset + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

// Shared by the Shell outline and the preference samples.
export function paintOutline(cr, width, height, radius, paint) {
    const {shade} = paint;
    const stroke = (source, lineWidth) => {
        roundedRect(cr, lineWidth / 2, width, height, radius);
        cr.setSource(source);
        cr.setLineWidth(lineWidth);
        cr.stroke();
    };
    const edge = new Cairo.LinearGradient(0, 0, 0, height);
    edge.addColorStopRGBA(0, shade, shade, shade, paint.top);
    if (paint.glints.length > 0)
        edge.addColorStopRGBA(0.5, shade, shade, shade, Math.min(paint.top, paint.bottom) * 0.4);
    edge.addColorStopRGBA(1, shade, shade, shade, paint.bottom);
    stroke(edge, 1);
    const inset = radius * 0.6;
    const centers = {
        'top-left': [inset, inset],
        'top-right': [width - inset, inset],
        'bottom-left': [inset, height - inset],
        'bottom-right': [width - inset, height - inset],
    };
    // A wide faint stroke under each glint reads as light caught by the edge.
    for (const [corner, alpha] of paint.glints) {
        const [x, y] = centers[corner];
        for (const [lineWidth, weight] of [[1, 1], [3, 0.3]]) {
            const glint = new Cairo.RadialGradient(x, y, 0, x, y, radius * 3);
            glint.addColorStopRGBA(0, shade, shade, shade, alpha * weight);
            glint.addColorStopRGBA(1, shade, shade, shade, 0);
            stroke(glint, lineWidth);
        }
    }
}
