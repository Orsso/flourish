import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

const EFFECT_NAME = 'flourish-dim';

const DimEffect = GObject.registerClass({
    Properties: {
        level: GObject.ParamSpec.double('level', null, null,
            GObject.ParamFlags.READWRITE, 0, 1, 0),
    },
}, class DimEffect extends Clutter.BrightnessContrastEffect {
    get level() {
        return this._level ?? 0;
    }

    set level(value) {
        this._level = value;
        this.set_brightness(-value);
    }
});

export function setIconDim(actor, level, animation = null) {
    let effect = actor.get_effect(EFFECT_NAME);
    if (!effect && level === 0)
        return;
    if (!effect) {
        effect = new DimEffect({name: EFFECT_NAME});
        actor.add_effect(effect);
    }
    actor.remove_transition(`@effects.${EFFECT_NAME}.level`);
    if (animation) {
        actor.ease_property(`@effects.${EFFECT_NAME}.level`, level, animation);
    } else if (level === 0) {
        actor.remove_effect(effect);
    } else {
        effect.level = level;
    }
}
