import Adw from "gi://Adw?version=1";
import Gio from "gi://Gio";
import logger from "../logger.js";
import DBusPreviewer from "./DBusPreviewer.js";

export default function Previewer({ output, builder, onWindowChange }) {
  const stack = builder.get_object("stack_preview");

  (function start_process() {
    Gio.Subprocess.new(
      ["workbench-vala-previewer"],
      Gio.SubprocessFlags.NONE
    ).wait_async(null, (proc, res) => {
      try {
        proc.wait_finish(res);
      } catch (err) {
        logError(err);
      }
      start_process();
    });
  })();

  const dbus_proxy = DBusPreviewer();
  dbus_proxy.connectSignal("WindowOpen", (proxy, name_owner, [open]) => {
    onWindowChange(open);
  });

  function start() {
    builder.get_object("button_screenshot").visible = false;
  }

  function open() {
    updateColorScheme();
    stack.set_visible_child_name("close_window");
    try {
      dbus_proxy.OpenWindowSync(
        output.get_allocated_width(),
        output.get_allocated_height()
      );
    } catch (err) {
      logger.debug(err);
    }
  }

  function close() {
    try {
      dbus_proxy.CloseWindowSync();
      // eslint-disable-next-line no-empty
    } catch (err) {
      logger.debug(err);
    }
    stack.set_visible_child_name("open_window");
  }

  function stop() {
    close();
  }

  function updateXML({ xml, target_id, original_id }) {
    try {
      dbus_proxy.UpdateUiSync(xml, target_id, original_id);
    } catch (err) {
      logger.debug(err);
    }
  }

  function openInspector() {
    try {
      dbus_proxy.EnableInspectorSync(true);
    } catch (err) {
      logger.debug(err);
    }
  }

  function closeInspector() {
    try {
      dbus_proxy.EnableInspectorSync(false);
    } catch (err) {
      logger.debug(err);
    }
  }

  const style_manager = Adw.StyleManager.get_default();
  function updateColorScheme() {
    try {
      dbus_proxy.ColorScheme = style_manager.color_scheme;
    } catch (err) {
      logger.debug(err);
    }
  }
  style_manager.connect("notify::color-scheme", updateColorScheme);

  return {
    start,
    stop,
    open,
    close,
    openInspector,
    closeInspector,
    updateXML,
    updateCSS(css) {
      try {
        dbus_proxy.UpdateCssSync(css);
      } catch (err) {
        logger.debug(err);
      }
    },
    screenshot() {},
  };
}
