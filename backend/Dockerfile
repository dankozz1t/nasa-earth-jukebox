# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/EarthJukebox.Api/EarthJukebox.Api.csproj src/EarthJukebox.Api/
RUN dotnet restore src/EarthJukebox.Api/EarthJukebox.Api.csproj
COPY src ./src
RUN dotnet publish src/EarthJukebox.Api/EarthJukebox.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /out ./
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_gcServer=0
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "EarthJukebox.Api.dll"]
