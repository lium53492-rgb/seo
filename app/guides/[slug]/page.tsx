import PublishedSeoPage, {
  generateMetadata as generatePublishedSeoMetadata,
  generateStaticParams as generatePublishedSeoStaticParams,
} from "../../[slug]/page";

export const dynamicParams = false;
export const generateMetadata = generatePublishedSeoMetadata;
export const generateStaticParams = generatePublishedSeoStaticParams;

export default PublishedSeoPage;
