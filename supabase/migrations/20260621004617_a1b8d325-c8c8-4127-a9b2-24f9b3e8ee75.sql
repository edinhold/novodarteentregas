DROP TRIGGER IF EXISTS trg_notify_drivers_on_new_request ON public.delivery_requests;
CREATE TRIGGER trg_notify_drivers_on_new_request
AFTER INSERT ON public.delivery_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_drivers_on_new_request();