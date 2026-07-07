// The class exists in no stylesheet; toggling any class name is enough to
// invalidate the widget's style context.
const REFRESH_CLASS = 'flourish-style-refresh';

export function refreshWidgetStyle(widget) {
    if (!widget)
        return;

    widget.add_style_class_name(REFRESH_CLASS);
    widget.remove_style_class_name(REFRESH_CLASS);
    widget.ensure_style();
    widget.queue_relayout();
    widget.queue_redraw();
}
