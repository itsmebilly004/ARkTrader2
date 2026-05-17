import { toast } from "sonner";

type Action = {
  label: string;
  onClick: (closeToast?: () => void) => void;
};

export const botNotification = (
  message: string,
  primary_action?: Action,
  _custom_style?: Record<string, unknown>,
) => {
  const id = toast(message, {
    duration: 6000,
    action: primary_action
      ? {
          label: primary_action.label,
          onClick: () => primary_action.onClick(() => toast.dismiss(id)),
        }
      : undefined,
  });
  return id;
};

export default botNotification;
