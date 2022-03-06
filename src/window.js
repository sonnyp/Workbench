import Gtk from "gi://Gtk";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Source from "gi://GtkSource?version=5";
import Adw from "gi://Adw?version=1";
import Vte from "gi://Vte?version=4-2.91";
import { gettext as _ } from "gettext";
import screenshot from "./screenshot.js";

import { confirm, settings, createUserDataDir } from "./util.js";
import Terminal from "./terminal.js";
import { targetBuildable, scopeStylesheet, replaceBufferText } from "./code.js";
import Document from "./Document.js";
import PanelUi from "./panel_ui.js";

import prettier from "./lib/prettier.js";
import prettier_babel from "./lib/prettier-babel.js";
import prettier_postcss from "./lib/prettier-postcss.js";
import prettier_xml from "./lib/prettier-xml.js";

Source.init();

const scheme_manager = Source.StyleSchemeManager.get_default();
const style_manager = Adw.StyleManager.get_default();

export default function Window({ application, datadir }) {
  Vte.Terminal.new();
  const user_datadir = createUserDataDir();

  const builder = Gtk.Builder.new_from_resource(
    "/re/sonny/Workbench/window.ui"
  );

  const devtools = builder.get_object("devtools");

  const window = builder.get_object("window");
  // window.add_css_class("devel");
  window.set_application(application);

  const output = builder.get_object("output");

  const panel_javascript = builder.get_object("panel_javascript");
  const panel_css = builder.get_object("panel_css");
  const panel_ui = builder.get_object("panel_ui");
  const panel_preview = builder.get_object("panel_preview");

  const source_view_javascript = builder.get_object("source_view_javascript");
  const documents = [];

  const terminal = Terminal({ application, window, devtools, builder });

  // FIXME: when to save gtkpaned position?
  const paned = builder.get_object("paned");

  // For some reasons those don't work
  // as builder properties
  paned.set_shrink_start_child(false);
  paned.set_shrink_end_child(false);
  paned.set_resize_start_child(true);
  paned.set_resize_end_child(true);
  paned.get_start_child().set_size_request(-1, 200);
  paned.get_end_child().set_size_request(-1, 200);

  documents.push(
    Document({
      source_view: source_view_javascript,
      lang: "js",
      placeholder: Gio.resources_lookup_data(
        "/re/sonny/Workbench/welcome.js",
        Gio.ResourceLookupFlags.NONE
      ),
      ext: "js",
      user_datadir,
    })
  );

  const source_view_ui = builder.get_object("source_view_ui");
  const document_ui = PanelUi({ builder, user_datadir, datadir });
  documents.push(document_ui);

  const source_view_css = builder.get_object("source_view_css");
  documents.push(
    Document({
      source_view: source_view_css,
      lang: "css",
      placeholder: Gio.resources_lookup_data(
        "/re/sonny/Workbench/welcome.css",
        Gio.ResourceLookupFlags.NONE
      ),
      ext: "css",
      user_datadir,
    })
  );

  const button_run = builder.get_object("button_run");
  const button_javascript = builder.get_object("button_javascript");
  const button_ui = builder.get_object("button_ui");
  const button_css = builder.get_object("button_css");
  const button_preview = builder.get_object("button_preview");
  const button_devtools = builder.get_object("button_devtools");
  const button_inspector = builder.get_object("button_inspector");
  const button_light = builder.get_object("button_light");
  const button_dark = builder.get_object("button_dark");
  button_dark.set_group(button_light);

  function updateStyle() {
    const { dark } = style_manager;
    const scheme = scheme_manager.get_scheme(dark ? "Adwaita-dark" : "Adwaita");
    documents.forEach(({ source_view }) => {
      source_view.buffer.set_style_scheme(scheme);
    });

    button_dark.active = dark;
    button_light.active = !dark;
  }
  updateStyle();
  style_manager.connect("notify::dark", updateStyle);

  button_light.connect("toggled", () => {
    settings.set_boolean("toggle-color-scheme", button_light.active);
  });

  settings.bind("show-ui", button_ui, "active", Gio.SettingsBindFlags.DEFAULT);
  button_ui.bind_property(
    "active",
    panel_ui,
    "visible",
    GObject.BindingFlags.SYNC_CREATE
  );

  settings.bind(
    "show-style",
    button_css,
    "active",
    Gio.SettingsBindFlags.DEFAULT
  );
  button_css.bind_property(
    "active",
    panel_css,
    "visible",
    GObject.BindingFlags.SYNC_CREATE
  );

  settings.bind(
    "show-code",
    button_javascript,
    "active",
    Gio.SettingsBindFlags.DEFAULT
  );
  button_javascript.bind_property(
    "active",
    panel_javascript,
    "visible",
    GObject.BindingFlags.SYNC_CREATE
  );

  settings.bind(
    "show-preview",
    button_preview,
    "active",
    Gio.SettingsBindFlags.DEFAULT
  );
  button_preview.bind_property(
    "active",
    panel_preview,
    "visible",
    GObject.BindingFlags.SYNC_CREATE
  );

  settings.bind(
    "show-devtools",
    button_devtools,
    "active",
    Gio.SettingsBindFlags.DEFAULT
  );
  button_devtools.bind_property(
    "active",
    devtools,
    "visible",
    GObject.BindingFlags.SYNC_CREATE
  );

  button_inspector.connect("clicked", () => {
    Gtk.Window.set_interactive_debugging(true);
  });

  source_view_ui.buffer.connect("changed", updatePreview);
  source_view_css.buffer.connect("changed", updatePreview);
  // We do not support auto run of JavaScript ATM
  // source_view_javascript.buffer.connect("changed", updatePreview);

  const workbench = (globalThis.workbench = {
    window,
    application,
  });

  let css_provider = null;

  function updatePreview() {
    output.set_child(null);

    const builder = new Gtk.Builder();
    workbench.builder = builder;

    let text = document_ui.get_text();
    if (!text) return;
    let target_id;

    try {
      [target_id, text] = targetBuildable(text);
    } catch (err) {
      // logError(err);
    }

    if (!target_id) return;

    try {
      builder.add_from_string(text, -1);
    } catch (err) {
      logError(err);
      return;
    }

    // Update preview with UI
    const object_preview = builder.get_object(target_id);
    if (object_preview) {
      output.set_child(object_preview);
    }

    // Update preview with CSS
    if (css_provider) {
      Gtk.StyleContext.remove_provider_for_display(
        output.get_display(),
        css_provider
      );
      css_provider = null;
    }
    let style = source_view_css.buffer.text;
    if (!style) return;

    try {
      style = scopeStylesheet(style);
    } catch (err) {
      // logError(err);
    }

    css_provider = new Gtk.CssProvider();
    css_provider.load_from_data(style);
    Gtk.StyleContext.add_provider_for_display(
      output.get_display(),
      css_provider,
      Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
  }
  updatePreview();

  function format(buffer, formatter) {
    const code = formatter(buffer.text.trim());

    const { cursor_position } = buffer;

    replaceBufferText(buffer, code);
    buffer.place_cursor(buffer.get_iter_at_offset(cursor_position));

    return code;
  }

  function run() {
    button_run.set_sensitive(false);

    terminal.clear();

    const javascript = format(source_view_javascript.buffer, (text) => {
      return prettier.format(source_view_javascript.buffer.text, {
        parser: "babel",
        plugins: [prettier_babel],
        trailingComma: "all",
      });
    });

    format(source_view_css.buffer, (text) => {
      return prettier.format(text, {
        parser: "css",
        plugins: [prettier_postcss],
      });
    });

    format(source_view_ui.buffer, (text) => {
      return prettier.format(text, {
        parser: "xml",
        plugins: [prettier_xml],
        // xmlWhitespaceSensitivity: "ignore",
        // breaks the following
        // <child>
        //   <object class="GtkLabel">
        //     <property name="label">Edit Style and UI to reload the Preview</property>
        //     <property name="justify">center</property>
        //   </object>
        // </child>
        // by moving the value of the property label to a new line
        // <child>
        //   <object class="GtkLabel">
        //     <property name="label">
        //       Edit Style and UI to reload the Preview
        //     </property>
        //     <property name="justify">center</property>
        //   </object>
        // </child>
      });
    });

    updatePreview();

    if (!javascript.trim()) return;

    // We have to create a new file each time
    // because gjs doesn't appear to use etag for module caching
    // ?foo=Date.now() also does not work as expected
    // TODO: File a bug
    const [file_javascript] = Gio.File.new_tmp("workbench-XXXXXX.js");
    file_javascript.replace_contents(
      javascript,
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null
    );
    import(`file://${file_javascript.get_path()}`)
      .catch(logError)
      .finally(() => {
        button_run.set_sensitive(true);
        terminal.scrollToEnd();
      });
  }

  const action_run = new Gio.SimpleAction({
    name: "run",
    parameter_type: null,
  });
  action_run.connect("activate", run);
  window.add_action(action_run);
  application.set_accels_for_action("win.run", ["<Control>Return"]);

  const action_console = new Gio.SimpleAction({
    name: "console",
    parameter_type: null,
  });
  action_console.connect("activate", () => {
    settings.set_boolean(
      "show-devtools",
      !settings.get_boolean("show-devtools")
    );
  });
  window.add_action(action_console);
  application.set_accels_for_action("win.console", ["<Control><Shift>K"]);

  const action_clear = new Gio.SimpleAction({
    name: "clear",
    parameter_type: null,
  });
  action_clear.connect("activate", terminal.clear);
  window.add_action(action_clear);
  application.set_accels_for_action("win.clear", ["<Control>K"]);

  const action_reset = new Gio.SimpleAction({
    name: "reset",
    parameter_type: null,
  });
  action_reset.connect("activate", reset);
  window.add_action(action_reset);

  const screenshot_action = new Gio.SimpleAction({
    name: "screenshot",
    parameter_type: null,
  });
  screenshot_action.connect("activate", () => {
    screenshot({ window, widget: output, user_datadir });
  });
  window.add_action(screenshot_action);

  function confirmDiscard() {
    return confirm({
      transient_for: window,
      text: _("Are you sure you want to discard your changes?"),
    });
  }

  async function reset() {
    const agreed = await confirmDiscard();
    if (!agreed) return;

    settings.reset("show-code");
    settings.reset("show-style");
    settings.reset("show-ui");
    settings.reset("show-preview");
    settings.reset("toggle-color-scheme");
    settings.reset("show-devtools");
    documents.forEach((document) => {
      document.reset();
    });
  }

  const text_decoder = new TextDecoder();
  function openFile(file) {
    let content_type;

    try {
      const info = file.query_info(
        "standard::content-type",
        Gio.FileQueryInfoFlags.NONE,
        null
      );
      content_type = info.get_content_type();
    } catch (err) {
      logError(err);
    }

    if (!content_type) {
      return;
    }

    let data;

    try {
      [, data] = file.load_contents(null);
      data = text_decoder.decode(data);
    } catch (err) {
      logError(err);
      return;
    }

    async function load(buffer, data) {
      const agreed = await confirmDiscard();
      if (!agreed) return;

      replaceBufferText(buffer, data);
      buffer.place_cursor(buffer.get_start_iter());
    }

    if (content_type.includes("/javascript")) {
      load(source_view_javascript.buffer, data);
    } else if (content_type.include("text/css")) {
      load(source_view_css.buffer, data);
    } else if (content_type.includes("application/x-gtk-builder")) {
      load(source_view_ui.buffer, data);
    }
  }

  return { window, openFile };
}
