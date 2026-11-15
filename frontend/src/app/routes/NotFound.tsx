import { Link } from "react-router";
import { useT } from "../../shared/i18n";
import { RouteHeading } from "../RouteHeading";

export default function NotFound() {
  const { t } = useT();
  return (
    <section>
      <RouteHeading>{t("notFound.title")}</RouteHeading>
      <Link to="/">{t("notFound.home")}</Link>
    </section>
  );
}
