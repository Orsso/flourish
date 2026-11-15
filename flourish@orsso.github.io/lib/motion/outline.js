import Cairo from 'cairo';

import {OutlineLight, OutlineStyle} from './catalog.js';

// Intensity at which the light and dark edges match 1.2.
const REFERENCE_INTENSITY = 60;
const EDGES = {
    [OutlineStyle.LIGHT]: {shade: 1, alpha: 0.18},
    [OutlineStyle.DARK]: {shade: 0, alpha: 0.35},
};
// Along the light: the near rim, the middle and the far rim, then the two glints.
const GLASS = {near: 0.14, middle: 0.05, far: 0.08, glint: 0.6, counter: 0.35};

export function outlinePaint(style, intensity, light, darkScheme) {
    const scale = intensity / REFERENCE_INTENSITY;
    if (style === OutlineStyle.NONE || scale === 0)
        return null;
    const alpha = value => Math.min(1, value * scale);
    if (style === OutlineStyle.GLASS) {
        return {
            shade: 1,
            light: light / OutlineLight.MAX,
            near: alpha(GLASS.near),
            middle: alpha(GLASS.middle),
            far: alpha(GLASS.far),
            glint: alpha(GLASS.glint),
            counter: alpha(GLASS.counter),
        };
    }
    const edge = style === OutlineStyle.AUTO
        ? EDGES[darkScheme ? OutlineStyle.LIGHT : OutlineStyle.DARK]
        : EDGES[style];
    return {shade: edge.shade, light: null, alpha: alpha(edge.alpha)};
}

export function roundedRect(cr, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    cr.newSubPath();
    cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

// Shared by the Shell outline and the preference samples; a 1 px line centered on the edge pixels.
export function paintOutline(cr, width, height, radius, paint) {
    const {shade} = paint;
    const stroke = setSource => {
        roundedRect(cr, 0.5, 0.5, width - 1, height - 1, radius - 0.5);
        setSource();
        cr.setLineWidth(1);
        cr.stroke();
    };
    if (paint.light === null) {
        stroke(() => cr.setSourceRGBA(shade, shade, shade, paint.alpha));
        return;
    }
    // The light runs along the top edge and turns into the corner at either end.
    const inset = radius * 0.6;
    const x = width / 2 + paint.light * (width / 2 - inset);
    const y = inset * Math.max(0, Math.abs(paint.light) * 5 - 4);
    const [farX, farY] = [width - x, height - y];
    const rim = new Cairo.LinearGradient(x, y, farX, farY);
    rim.addColorStopRGBA(0, shade, shade, shade, paint.near);
    rim.addColorStopRGBA(0.5, shade, shade, shade, paint.middle);
    rim.addColorStopRGBA(1, shade, shade, shade, paint.far);
    stroke(() => cr.setSource(rim));
    const reach = Math.max(width, height);
    for (const [gx, gy, alpha, extent] of [[x, y, paint.glint, 0.18], [farX, farY, paint.counter, 0.12]]) {
        const size = reach * extent;
        const glint = new Cairo.RadialGradient(gx, gy, 0, gx, gy, size);
        glint.addColorStopRGBA(0, shade, shade, shade, alpha);
        glint.addColorStopRGBA(1, shade, shade, shade, 0);
        // Past its radius a glint is transparent; the clip spares Cairo the rest of the surface.
        cr.save();
        cr.rectangle(Math.floor(gx - size), Math.floor(gy - size), Math.ceil(2 * size) + 1, Math.ceil(2 * size) + 1);
        cr.clip();
        stroke(() => cr.setSource(glint));
        cr.restore();
    }
}
