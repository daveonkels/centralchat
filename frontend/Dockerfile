# Build frontend/dist with the pinned pnpm version through sfw before Docker.
# No package-manager execution or dependency downloads occur in this image.
FROM nginx:alpine

COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
